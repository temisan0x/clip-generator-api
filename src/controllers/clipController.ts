import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import clipQueue from "../queue/clipQueue";
import { uploadToCloudinary } from "../services/cloudinary";
import fs from "node:fs";

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

      const { prompt, ratio = "9:16" } = req.body;

      if (!prompt?.trim()) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      console.log(`📤 Uploading ${req.file.originalname} to Cloudinary...`);

      const cloudinaryResult = await uploadToCloudinary(req.file.path, "video");

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
      // This is the "Safety Net" that clears the /uploads folder 
      // whether the code succeeds or crashes.
      if (req.file?.path) {
        cleanupFile(req.file.path); 
      }
    } // <--- Added missing closing brace
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