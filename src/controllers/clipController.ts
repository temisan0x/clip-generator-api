import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import clipQueue from "../queue/clipQueue";
import { uploadToCloudinary } from "../services/cloudinary";
import fs from "node:fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegPath!);

const MAX_VIDEO_SIZE_MB = Number(process.env.MAX_VIDEO_SIZE_MB ?? "25");
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

const probeFile = (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err || !data || !Array.isArray(data.streams) || data.streams.length === 0) {
        return resolve(false);
      }
      resolve(true);
    });
  });
};

const transcodeToMp4 = (input: string): Promise<string> => {
  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  const out = path.join(dir, `${base}-fixed.mp4`);

  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(["-c:v libx264", "-preset superfast", "-crf 23", "-c:a aac", "-movflags +faststart"])
      .output(out)
      .on("end", () => resolve(out))
      .on("error", (err) => reject(err))
      .run();
  });
};

function createClipController() {
  const cleanupFile = (filePath?: string) => {
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      fs.unlinkSync(filePath);
      console.log(`🧹 Deleted temp file: ${filePath}`);
    } catch (err: any) {
      console.error(`⚠️ Cleanup failed for ${filePath}:`, err.message);
    }
  };

  const uploadFile = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileSizeBytes = fs.statSync(req.file.path).size;
      if (fileSizeBytes > MAX_VIDEO_SIZE_BYTES) {
        return res.status(400).json({
          error: `Video too large — max supported size is ${MAX_VIDEO_SIZE_MB}MB.`,
        });
      }

      const { prompt, ratio = "9:16" } = req.body;

      if (!prompt?.trim()) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const originalUploadPath = req.file.path;
      let activeUploadPath = originalUploadPath;

      console.log(`📤 Probing uploaded file: ${originalUploadPath}`);
      const probed = await probeFile(originalUploadPath);
      if (!probed) {
        console.log("⚠️ Probe failed — attempting transcode before upload");
        try {
          const fixed = await transcodeToMp4(originalUploadPath);
          activeUploadPath = fixed;
          console.log(`✅ Transcode complete, will upload: ${activeUploadPath}`);
        } catch (err: any) {
          console.error("Transcode failed:", err?.message || err);
          return res.status(400).json({ error: "Unsupported video format or file" });
        }
      }

      console.log(`📤 Uploading ${req.file.originalname} to Cloudinary...`);

      let cloudinaryResult;
      try {
        cloudinaryResult = await uploadToCloudinary(activeUploadPath, "video");
      } catch (err: any) {
        console.error("Upload error, attempting fallback transcode:", err?.message || err);
        // If we already tried a transcode, fail; otherwise try transcode and retry once.
        if (activeUploadPath === originalUploadPath) {
          try {
            const fixed = await transcodeToMp4(originalUploadPath);
            activeUploadPath = fixed;
            cloudinaryResult = await uploadToCloudinary(activeUploadPath, "video");
          } catch (err2: any) {
            console.error("Retry transcode/upload failed:", err2?.message || err2);
            throw err2;
          }
        } else {
          throw err;
        }
      }

      const jobId = uuidv4();

      await clipQueue().add(
        "process-clip",
        {
          jobId,
          cloudinaryUrl: cloudinaryResult.url,           
          publicId: cloudinaryResult.publicId,
          mimeType: req.file.mimetype,
          prompt: prompt.trim(),
          ratio,
          originalDuration: cloudinaryResult.duration || 0,
        },
        { jobId }
      );

      console.log(`✅ Job ${jobId} queued successfully`);

      return res.status(202).json({
        message: "Job queued successfully",
        jobId,
        statusUrl: `/api/job/${jobId}/status`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to process upload" 
      });
    } finally {
      // clean up both the original upload and any transcoded file
      try {
        const original = req.file?.path;
        if (original) cleanupFile(original);
        // if we produced a transcoded file it will have -fixed.mp4 suffix
        const fixed = original ? path.join(path.dirname(original), `${path.basename(original, path.extname(original))}-fixed.mp4`) : null;
        if (fixed && fixed !== original) cleanupFile(fixed);
      } catch (e: any) {
        console.error("Cleanup error:", e?.message || e);
      }
    } 
  };

  const uploadFromUrl = async (req: Request, res: Response) => {
    return res.status(501).json({ 
      error: "URL upload is temporarily disabled" 
    });
  };

  const getJobStatus = async (req: Request, res: Response) => {
    try {
      const queue = clipQueue();
      const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const state = await job.getState();

      return res.status(200).json({
        jobId,
        status: state,
        progress: job.progress || 0,
        result: state === "completed" ? job.returnvalue : null,
        error: state === "failed" ? job.failedReason : null,
      });
    } catch (error: any) {
      console.error("Job status error:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  };

  const getClips = async (_req: Request, res: Response) => {
    return res.status(200).json({ clips: [] });
  };

  return { 
    uploadFile, 
    uploadFromUrl, 
    getJobStatus, 
    getClips 
  };
}

export { createClipController };