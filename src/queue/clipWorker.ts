import { Worker } from "bullmq";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import bullRedis from "../config/redis.bull";
import fs from "fs";
import type { ClipJobData } from "../types/clipJob";

let workerInstance: Worker<ClipJobData> | null = null;
let loggedReady = false;

const startWorker = () => {
  if (workerInstance) return workerInstance;

  console.log("🚀 Initializing Clip Worker...");

  bullRedis
    .ping()
    .then(() => console.log("🟢 Redis PING successful"))
    .catch((err) => console.error("🔴 Redis PING failed:", err.message));

  const worker = new Worker<ClipJobData>(
    "clip-processing",
    async (job) => {
      const { tempFilePath, mimeType, prompt, ratio, cleanupDir } = job.data;

      console.log(`⚡ Processing job: ${job.id}`);
      console.log(`📁 tempFilePath: ${tempFilePath}`);
      console.log(`📁 exists: ${fs.existsSync(tempFilePath)}`);
      console.log(`📁 cleanupDir: ${cleanupDir}`);

      // verify file exists before doing anything
      if (!fs.existsSync(tempFilePath)) {
        throw new Error(`File not found for processing: ${tempFilePath}`);
      }

      let tempCopyPath: string | undefined;

      try {
        await job.updateProgress(10);

        // transcribe using original file
        const transcript = await transcribeMedia(tempFilePath, mimeType);
        await job.updateProgress(25);

        // copy before cloudinary deletes the original
        tempCopyPath = tempFilePath + ".copy.mp4";
        fs.copyFileSync(tempFilePath, tempCopyPath);
        console.log(`📋 Copy created: ${tempCopyPath}`);

        // upload original to cloudinary (this deletes tempFilePath)
        const uploaded = await uploadToCloudinary(tempFilePath, "video");
        await job.updateProgress(50);

        // ai clip selection
        const selectedClips = await selectClips(
          transcript,
          prompt,
          ratio,
          uploaded.duration ?? 0
        );
        await job.updateProgress(70);

        // cut clips using the copy
        const generatedClips = await generateClips(
          tempCopyPath,
          selectedClips,
          ratio
        );

        // delete copy after ffmpeg is done
        if (fs.existsSync(tempCopyPath)) {
          fs.unlinkSync(tempCopyPath);
          console.log(`🧹 Deleted copy: ${tempCopyPath}`);
        }

        await job.updateProgress(85);

        // upload each clip
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

        return {
          original: uploaded,
          transcript,
          selectedClips,
          clips: finalClips,
        };

      } catch (err) {
        // clean up copy if something failed mid-way
        if (tempCopyPath && fs.existsSync(tempCopyPath)) {
          fs.unlinkSync(tempCopyPath);
        }
        throw err;

      } finally {
        // clean up session directory for URL downloads
        try {
          if (cleanupDir && fs.existsSync(cleanupDir)) {
            fs.rmSync(cleanupDir, { recursive: true, force: true });
            console.log(`🧹 Deleted session dir: ${cleanupDir}`);
          }
        } catch (e: any) {
          console.error("Cleanup error:", e.message);
        }
      }
    },
    { connection: bullRedis }
  );

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
    if (!err?.message) return; 
    if (err.message.includes("ETIMEDOUT")) {
      console.error("🚨 Redis timeout detected");
    } else {
      console.error("❌ Worker error:", err.message);
    }
  });

  workerInstance = worker;
  return worker;
};

export default startWorker;