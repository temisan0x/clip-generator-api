import { Worker, Job } from "bullmq";
import bullRedis from "../config/redis.bull";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import fs from "fs";
import path from "path";
import type { ClipJobData } from "../types/clipJob";

let workerInstance: Worker<ClipJobData> | null = null;

const TEMP_DIR = path.join(process.cwd(), "temp");

const ensureTempDir = () => {
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
  } catch (e) {
    console.error("Failed to create temp dir:", e);
  }
}

// Helper to download from Cloudinary
const downloadFromCloudinary = async (url: string, jobId: string): Promise<string> => {
  const localPath = path.join(TEMP_DIR, `${jobId}-original.mp4`);
  
  console.log(`⬇️ Downloading from Cloudinary: ${url}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(buffer));

  console.log(`✅ Downloaded to: ${localPath}`);
  return localPath;
};

const cleanupFile = (filePath?: string) => {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
    console.log(`🧹 Cleaned: ${filePath}`);
  } catch (e) {
    console.error(`⚠️ Failed to clean ${filePath}:`, e);
  }
};

const startWorker = () => {
  if (workerInstance) return workerInstance;

  console.log("🚀 Initializing Clip Worker...");

  ensureTempDir();

  const worker = new Worker<ClipJobData>(
    "clip-processing",
    async (job: Job<ClipJobData>) => {
      const { cloudinaryUrl, publicId, prompt, ratio, originalDuration } = job.data;

      console.log(`⚡ Processing job ${job.id}`);

      let localVideoPath: string | undefined;
      let tempCopyPath: string | undefined;

      try {
        // 1. Download video from Cloudinary
        await job.updateProgress(5);
        localVideoPath = await downloadFromCloudinary(cloudinaryUrl, job.id!);

        // 2. Transcription
        await job.updateProgress(15);
        const transcript = await transcribeMedia(localVideoPath, "video/mp4");
        await job.updateProgress(30);

        // 3. AI Clip Selection
        const selectedClips = await selectClips(
          transcript,
          prompt,
          ratio,
          originalDuration
        );
        await job.updateProgress(50);

        tempCopyPath = localVideoPath + ".copy.mp4";
        fs.copyFileSync(localVideoPath, tempCopyPath);

        await job.updateProgress(60);
        const generatedClips = await generateClips(tempCopyPath, selectedClips, ratio);
        await job.updateProgress(80);

        const finalClips = await Promise.all(
          generatedClips.map(async (clip, i) => {
            const result = await uploadToCloudinary(
              clip.localPath,
              "video",
              "clip-generator/clips"
            );

            cleanupFile(clip.localPath); 

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
          original: { url: cloudinaryUrl, publicId },
          transcript,
          selectedClips,
          clips: finalClips,
        };

      } catch (err: any) {
        console.error(`💥 Job ${job.id} failed:`, err.message);
        throw err;
      } finally {
        [localVideoPath, tempCopyPath].forEach(cleanupFile);
      }
    },
    {
      connection: bullRedis,
      concurrency: 1,
      lockDuration: 600000,
      stalledInterval: 90000,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  worker.on("ready", () => console.log("🟢 Worker ready"));
  worker.on("active", (job) => console.log(`⚡ Job ${job.id} started`));
  worker.on("completed", (job) => console.log(`🎉 Job ${job.id} completed`));
  worker.on("failed", (job, err) =>
    console.error(`💥 Job ${job?.id} failed:`, err.message)
  );

  workerInstance = worker;
  return worker;
};

export default startWorker;