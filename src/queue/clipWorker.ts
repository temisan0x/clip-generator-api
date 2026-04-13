import { Worker, Job } from "bullmq";
import bullRedis from "../config/redis.bull";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import fs from "fs";
import type { ClipJobData } from "../types/clipJob";

let workerInstance: Worker<ClipJobData> | null = null;

const startWorker = () => {
  if (workerInstance) return workerInstance;

  console.log("🚀 Initializing Clip Worker...");

  const worker = new Worker<ClipJobData>(
    "clip-processing",
    async (job: Job<ClipJobData>) => {
      const { tempFilePath, mimeType, prompt, ratio, cleanupDir } = job.data;

      console.log(`⚡ Processing job ${job.id}`);

      let tempCopyPath: string | undefined;

      try {
        // === Step 1: Transcription ===
        await job.updateProgress(10);
        const transcript = await transcribeMedia(tempFilePath, mimeType);
        await job.updateProgress(25);

        // === Step 2: Create copy for processing ===
        tempCopyPath = tempFilePath + ".copy.mp4";
        fs.copyFileSync(tempFilePath, tempCopyPath);

        // === Step 3: Upload original ===
        await job.updateProgress(35);
        const uploaded = await uploadToCloudinary(tempFilePath, "video");
        await job.updateProgress(50);

        // === Step 4: AI Selection ===
        const selectedClips = await selectClips(
          transcript,
          prompt,
          ratio,
          uploaded.duration ?? 0
        );
        await job.updateProgress(65);

        // === Step 5: FFmpeg Clipping (Most Memory Heavy) ===
        await job.updateProgress(70);
        const generatedClips = await generateClips(tempCopyPath, selectedClips, ratio);
        await job.updateProgress(85);

        // === Step 6: Upload final clips ===
        const finalClips = await Promise.all(
          generatedClips.map(async (clip, i) => {
            const result = await uploadToCloudinary(clip.localPath, "video", "clip-generator/clips");

            // Delete local clip immediately after upload
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

        return {
          original: uploaded,
          transcript,
          selectedClips,
          clips: finalClips,
        };

      } catch (err: any) {
        console.error(`💥 Job ${job.id} failed:`, err.message);
        throw err;
      } finally {
        // Aggressive cleanup
        [tempFilePath, tempCopyPath].forEach((path) => {
          if (path && fs.existsSync(path)) {
            try { fs.unlinkSync(path); } catch (_) {}
          }
        });

        if (cleanupDir && fs.existsSync(cleanupDir)) {
          try {
            fs.rmSync(cleanupDir, { recursive: true, force: true });
          } catch (_) {}
        }
      }
    },
    {
      connection: bullRedis,
      concurrency: 1,               // Very important on low memory
      lockDuration: 600000,         // 10 minutes (long jobs)
      stalledInterval: 90000,       // 90 seconds
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  // Events
  worker.on("ready", () => console.log("🟢 Worker ready"));
  worker.on("active", (job) => console.log(`⚡ Job ${job.id} started`));
  worker.on("completed", (job) => console.log(`🎉 Job ${job.id} completed`));
  worker.on("failed", (job, err) => console.error(`💥 Job ${job?.id} failed:`, err.message));

  workerInstance = worker;
  return worker;
};

export default startWorker;