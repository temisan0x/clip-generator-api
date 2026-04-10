// src/queue/clipWorker.ts
import { Worker, Job } from "bullmq";
import getRedisClient from "../config/redis";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import fs from "fs";
import path from "path";

interface JobData {
  jobId: string;
  tempFilePath: string;
  mimeType: string;
  prompt: string;
  ratio: string;
}

const startWorker = () => {
  const connection = getRedisClient();

  const clipWorker = new Worker<JobData>(
    "clip-processing",
    async (job: Job<JobData>) => {
      const { tempFilePath, mimeType, prompt, ratio } = job.data;

      console.log(`🚀 Processing job ${job.id} | Prompt: ${prompt}`);

      try {
        // Step 1: Transcription
        await job.updateProgress(10);
        console.log(`📝 Transcribing... File: ${tempFilePath}`);
        const transcript = await transcribeMedia(tempFilePath, mimeType);
        await job.updateProgress(25);

        // Step 2: Create backup copy
        const tempCopyPath = tempFilePath + ".copy.mp4";
        fs.copyFileSync(tempFilePath, tempCopyPath);

        // Step 3: Upload original video
        await job.updateProgress(35);
        console.log(`☁️ Uploading original to Cloudinary...`);

        let uploaded;
        try {
          uploaded = await uploadToCloudinary(tempFilePath, "video");
        } catch (err: any) {
          console.error("Cloudinary upload failed:", err.message);
          throw new Error(`Failed to upload original video: ${err.message}`);
        }

        // Step 4: AI Clip Selection
        await job.updateProgress(50);
        console.log(`🤖 Selecting best clips with Groq...`);
        const selectedClips = await selectClips(
          transcript,
          prompt,
          ratio,
          uploaded.duration ?? 0,
        );
        await job.updateProgress(65);

        // Step 5: Generate clips with FFmpeg
        await job.updateProgress(70);
        console.log(`✂️ Cutting ${selectedClips.length} clips with FFmpeg...`);
        const generatedClips = await generateClips(
          tempCopyPath,
          selectedClips,
          ratio,
        );

        // Cleanup temp copy
        if (fs.existsSync(tempCopyPath)) fs.unlinkSync(tempCopyPath);
        await job.updateProgress(80);

        // Step 6: Upload generated clips to Cloudinary
        await job.updateProgress(85);
        console.log(`☁️ Uploading ${generatedClips.length} clips...`);

        const finalClips = await Promise.all(
          generatedClips.map(async (clip, index) => {
            const result = await uploadToCloudinary(
              clip.localPath,
              "video",
              "clip-generator/clips",
            );

            // Optional: delete local clip after successful upload
            if (fs.existsSync(clip.localPath)) fs.unlinkSync(clip.localPath);

            return {
              url: result.url,
              publicId: result.publicId,
              duration: clip.duration,
              description: selectedClips[index]?.description || "",
            };
          }),
        );

        await job.updateProgress(100);
        console.log(`✅ Job ${job.id} completed successfully!`);

        // Delete original uploaded temp file
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`🧹 Cleaned up original temp file: ${tempFilePath}`);
        }

        return {
          original: uploaded,
          transcript,
          selectedClips,
          clips: finalClips,
        };
      } catch (error: any) {
        console.error(`❌ Job ${job.id} failed at step:`, error.message);
        console.error(`Full Error:`, JSON.stringify(error, null, 2)); // ← Add this
        if (error.stack) console.error(error.stack);
        throw error;
      } finally {
        // Always try to clean up temp files (success or failure)
        const pathsToClean = [
          tempFilePath,
          tempFilePath + ".copy.mp4"
        ];

        pathsToClean.forEach((filePath) => {
          if (filePath && fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log(`🧹 Cleaned up: ${filePath}`);
            } catch (err: any) {
              console.error(`⚠️ Could not delete ${filePath}:`, err.message);
            }
          }
        });
      }
    },
    {
      connection,
      concurrency: 1, // Start with 1 (increase later if server is strong)
      removeOnComplete: { age: 3600 }, // Keep completed jobs for 1 hour
      removeOnFail: { age: 86400 }, // Keep failed jobs for 24 hours
    },
  );

  // Event Listeners
  clipWorker.on("ready", () => {
    console.log("✅ Clip Worker is ready and connected to Redis!");
  });

  clipWorker.on("active", (job) => {
    console.log(`⚡ Job ${job.id} is now processing...`);
  });

  clipWorker.on("completed", (job, result) => {
    console.log(`🎉 Job ${job.id} completed!`);
  });

  clipWorker.on("failed", (job, err) => {
    console.error(`💥 Job ${job?.id} failed:`, err.message);

    // Cleanup files on failure
    if (job?.data?.tempFilePath) {
      const paths = [
        job.data.tempFilePath,
        job.data.tempFilePath + ".copy.mp4",
      ];
      paths.forEach((p) => {
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
          } catch (_) {}
        }
      });
    }
  });

  clipWorker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  return clipWorker;
};

export default startWorker;
