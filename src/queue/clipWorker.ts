import { Worker, Job } from "bullmq";
import getRedisClient from "../config/redis";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import fs from "fs";

interface JobData {
  jobId: string;
  tempFilePath: string;
  mimeType: string;
  prompt: string;
  ratio: string;
  cleanupDir?: string;
}

let workerInstance: Worker<JobData> | null = null;

const startWorker = () => {
  if (workerInstance) return workerInstance;

  const connection = getRedisClient();

  const clipWorker = new Worker<JobData>(
    "clip-processing",
    async (job: Job<JobData>) => {
      const { tempFilePath, mimeType, prompt, ratio, cleanupDir } = job.data;

      console.log(`🚀 Starting job ${job.id}`);

      try {
        // Transcription
        await job.updateProgress(10);
        const transcript = await transcribeMedia(tempFilePath, mimeType);
        await job.updateProgress(25);

        // Upload Original
        await job.updateProgress(35);
        const uploaded = await uploadToCloudinary(tempFilePath, "video");

        // AI Selection
        await job.updateProgress(50);
        const selectedClips = await selectClips(transcript, prompt, ratio, uploaded.duration ?? 0);
        await job.updateProgress(65);

        // Generate Clips
        await job.updateProgress(70);
        const generatedClips = await generateClips(tempFilePath, selectedClips, ratio);
        await job.updateProgress(80);

        // Upload Clips
        await job.updateProgress(85);
        const finalClips = await Promise.all(
          generatedClips.map(async (clip, i) => {
            const result = await uploadToCloudinary(clip.localPath, "video", "clip-generator/clips");
            if (fs.existsSync(clip.localPath)) fs.unlinkSync(clip.localPath);

            return {
              url: result.url,
              publicId: result.publicId,
              duration: clip.duration,
              description: selectedClips[i]?.description || "",
            };
          })
        );

        await job.updateProgress(100);
        console.log(`✅ Job ${job.id} completed`);

        return {
          original: uploaded,
          transcript,
          selectedClips,
          clips: finalClips,
        };
      } catch (error: any) {
        console.error(`❌ Job ${job.id} failed:`, error.message);
        throw error;
      } finally {
        // Cleanup
        [tempFilePath, tempFilePath + ".copy.mp4"].forEach((p) => {
          if (p && fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (_) {}
          }
        });

        if (cleanupDir && fs.existsSync(cleanupDir)) {
          try { fs.rmSync(cleanupDir, { recursive: true, force: true }); } catch (_) {}
        }
      }
    },
    {
      connection,
      concurrency: 1,
      lockDuration: 300000,        // 5 minutes (important for long jobs)
      stalledInterval: 60000,      // Check for stalled jobs every 60s
      removeOnComplete: { age: 7200 },  // 2 hours
      removeOnFail: { age: 86400 },
    }
  );

  // Events
  clipWorker.on("ready", () => console.log("✅ Worker connected to Redis"));
  clipWorker.on("active", (job) => console.log(`⚡ Processing job ${job.id}`));
  clipWorker.on("completed", (job) => console.log(`🎉 Job ${job.id} done`));
  clipWorker.on("failed", (job, err) => console.error(`💥 Job ${job?.id} failed:`, err.message));
  clipWorker.on("error", (err) => console.error("Worker error:", err));

  workerInstance = clipWorker;
  return clipWorker;
};

export default startWorker;