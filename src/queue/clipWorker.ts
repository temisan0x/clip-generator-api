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
let loggedReady = false;

const startWorker = () => {
  if (workerInstance) return workerInstance;

  console.log("🚀 Initializing Clip Worker...");

  const connection = getRedisClient();

  // REAL Redis validation before worker starts
  connection.ping()
    .then(() => console.log("🟢 Redis PING successful"))
    .catch((err) => {
      console.error("🔴 Redis PING failed:", err.message);
    });

  const worker = new Worker<JobData>(
    "clip-processing",
    async (job: Job<JobData>) => {
      const { tempFilePath, mimeType, prompt, ratio, cleanupDir } = job.data;

      console.log(`⚡ Processing job: ${job.id}`);

      try {
        await job.updateProgress(10);
        const transcript = await transcribeMedia(tempFilePath, mimeType);

        await job.updateProgress(25);
        const uploaded = await uploadToCloudinary(tempFilePath, "video");

        await job.updateProgress(50);
        const selectedClips = await selectClips(
          transcript,
          prompt,
          ratio,
          uploaded.duration ?? 0
        );

        await job.updateProgress(70);
        const generatedClips = await generateClips(
          tempFilePath,
          selectedClips,
          ratio
        );

        await job.updateProgress(85);

        const finalClips = await Promise.all(
          generatedClips.map(async (clip, i) => {
            const result = await uploadToCloudinary(
              clip.localPath,
              "video",
              "clip-generator/clips"
            );

            if (fs.existsSync(clip.localPath)) {
              fs.unlinkSync(clip.localPath);
            }

            return {
              url: result.url,
              publicId: result.publicId,
              duration: clip.duration,
              description: selectedClips[i]?.description || "",
            };
          })
        );

        await job.updateProgress(100);

        console.log(`✅ Job completed: ${job.id}`);

        return {
          original: uploaded,
          transcript,
          selectedClips,
          clips: finalClips,
        };
      } catch (err: any) {
        console.error(`❌ Job failed: ${job.id}`, err.message);
        throw err;
      } finally {
        try {
          [tempFilePath, tempFilePath + ".copy.mp4"].forEach((p) => {
            if (p && fs.existsSync(p)) fs.unlinkSync(p);
          });

          if (cleanupDir && fs.existsSync(cleanupDir)) {
            fs.rmSync(cleanupDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.error("Cleanup error:", e);
        }
      }
    },
    {
      connection,
      concurrency: 1,
      lockDuration: 300000,
      stalledInterval: 60000,
      removeOnComplete: { age: 7200 },
      removeOnFail: { age: 86400 },
    }
  );

  // CLEAN EVENTS (NO MISLEADING LOGS)
  worker.on("ready", () => {
    if (!loggedReady) {
      console.log("🟢 Worker ready");
      loggedReady = true;
    }
  });

  worker.on("active", (job) => {
    console.log(`⚡ Active job: ${job.id}`);
  });

  worker.on("completed", (job) => {
    console.log(`🎉 Completed job: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`💥 Failed job: ${job?.id}`, err.message);
  });

  worker.on("error", (err) => {
    console.error("❌ Worker error:", err.message);
  });

  workerInstance = worker;

  return worker;
};

export default startWorker;