import { Worker, Job } from "bullmq";
import getBullRedis from "../config/redis.bull";
import { uploadToCloudinary, cloudinary } from "../services/cloudinary"; // Now importing 'cloudinary' too
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import fs from "fs";
import path from "path";
import { pipeline } from "node:stream/promises";
import type { ClipJobData } from "../types/clipJob";
import axios from "axios";

let workerInstance: Worker<ClipJobData> | null = null;
const TEMP_DIR = path.join(process.cwd(), "temp");

const ensureTempDir = () => {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
};

const downloadFromCloudinary = async (url: string, jobId: string): Promise<string> => {
  const localPath = path.join(TEMP_DIR, `${jobId}-original.mp4`);
  console.log(`⬇️ Downloading source: ${url}`);
  const writer = fs.createWriteStream(localPath);
  const response = await axios({ url, method: "GET", responseType: "stream" });
  await pipeline(response.data, writer);
  return localPath;
};

const cleanupFile = (filePath?: string) => {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
    console.log(`🧹 Cleaned disk: ${filePath}`);
  } catch (e: any) {
    console.error(`⚠️ Cleanup failed:`, e.message);
  }
};

const startWorker = () => {
  if (workerInstance) return workerInstance;
  ensureTempDir();

  const worker = new Worker<ClipJobData>(
    "clip-processing",
    async (job: Job<ClipJobData>) => {
      const { cloudinaryUrl, publicId, prompt, ratio, originalDuration } = job.data;
      let localVideoPath: string | undefined;

      try {
        await job.updateProgress(5);
        localVideoPath = await downloadFromCloudinary(cloudinaryUrl, job.id!);

        await job.updateProgress(15);
        const transcript = await transcribeMedia(localVideoPath, "video/mp4");
        
        await job.updateProgress(35);
        const selectedClips = await selectClips(transcript, prompt, ratio, originalDuration);
        
        await job.updateProgress(60);
        const generatedClips = await generateClips(localVideoPath, selectedClips, ratio);

        const finalClips = [];
        for (let i = 0; i < generatedClips.length; i++) {
          const clip = generatedClips[i];
          console.log(`📤 Uploading clip ${i + 1}/${generatedClips.length}...`);
          const result = await uploadToCloudinary(clip.localPath, "video", "clip-generator/clips");
          cleanupFile(clip.localPath); // Delete the small clip from disk after upload
          finalClips.push({
            url: result.url,
            publicId: result.publicId,
            duration: clip.duration,
            description: selectedClips[i]?.description || "",
          });
        }

        // --- NEW: Delete the massive original file from Cloudinary account ---
        try {
          console.log(`🗑️ Deleting original from Cloudinary: ${publicId}`);
          await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        } catch (delErr) {
          console.warn("Cloudinary cleanup failed (non-critical):", delErr);
        }

        await job.updateProgress(100);
        return { original: { url: cloudinaryUrl, publicId }, transcript, selectedClips, clips: finalClips };
      } catch (err: any) {
        console.error(`💥 Job ${job.id} failed:`, err.message);
        throw err;
      } finally {
        // ALWAYS clean up the main video from the server disk
        if (localVideoPath) cleanupFile(localVideoPath);
      }
    },
    {
      connection: getBullRedis(),
      concurrency: 1,
      lockDuration: 300000,
      stalledInterval: 90000,
    }
  );

  workerInstance = worker;
  return worker;
};

export default startWorker;
