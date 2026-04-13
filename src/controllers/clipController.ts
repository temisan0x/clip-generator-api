import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import clipQueue from "../queue/clipQueue";
import { Queue } from "bullmq";
import getRedisClient from "../config/redis";
import { downloadFromUrl } from "../utils/downloadFromUrl";
import path from "path";
import fs from "node:fs";

/**
 * Cleanup helpers
 */
const cleanupUploadedFile = (filePath?: string) => {
  if (!filePath) return;
  if (!fs.existsSync(filePath)) return;

  try {
    fs.unlinkSync(filePath);
    console.log(`🧹 Deleted upload: ${filePath}`);
  } catch (err: any) {
    console.error(`⚠️ Failed file cleanup:`, err.message);
  }
};

const cleanupDirectory = (dirPath?: string) => {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) return;

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`🧹 Deleted directory: ${dirPath}`);
  } catch (err: any) {
    console.error(`⚠️ Failed dir cleanup:`, err.message);
  }
};

function createClipController() {
  /**
   * Upload file endpoint
   */
  const uploadFile = async (req: Request, res: Response) => {
    let jobQueued = false;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { prompt, ratio } = req.body;

      if (!prompt) {
        cleanupUploadedFile(req.file.path);
        return res.status(400).json({ error: "Prompt is required" });
      }

      const jobId = uuidv4();

      await clipQueue().add(
        "process-clip",
        {
          jobId,
          tempFilePath: req.file.path,
          mimeType: req.file.mimetype,
          prompt,
          ratio: ratio || "16:9",
          cleanupDir: path.dirname(req.file.path),
        },
        { jobId },
      );

      jobQueued = true;

      return res.status(202).json({
        message: "Job queued successfully",
        jobId,
        statusUrl: `/api/job/${jobId}/status`,
      });
    } catch (error: any) {
      if (!jobQueued) cleanupUploadedFile(req.file?.path);

      console.error("Upload error:", error);
      return res.status(500).json({ error: error.message });
    }
  };

  /**
   * URL upload endpoint
   */
  const uploadFromUrl = async (req: Request, res: Response) => {
    let filePath: string | undefined;
    let cleanupDir: string | undefined;

    try {
      const { url, prompt, ratio = "9:16" } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      const urlDownloadsDir = path.join(process.cwd(), "temp", "url-downloads");

      const downloaded = await downloadFromUrl(url, urlDownloadsDir);

      if (!fs.existsSync(downloaded.filePath)) {
        throw new Error(`Downloaded file not found at: ${downloaded.filePath}`);
      }

      console.log(`✅ File verified at: ${downloaded.filePath}`);

      filePath = downloaded.filePath;
      cleanupDir = downloaded.cleanupDir;

      const jobId = uuidv4();

      await clipQueue().add(
        "process-clip",
        {
          jobId,
          tempFilePath: filePath,
          mimeType: downloaded.mimeType,
          prompt,
          ratio,
          cleanupDir,
        },
        { jobId },
      );

      return res.status(202).json({
        message: "Job queued successfully",
        jobId,
        statusUrl: `/api/job/${jobId}/status`,
      });
    } catch (error: any) {
      cleanupUploadedFile(filePath);
      cleanupDirectory(cleanupDir);

      console.error("URL upload error:", error);
      return res.status(500).json({ error: error.message });
    }
  };

  /**
   * Job status endpoint
   */
  const getJobStatus = async (req: Request, res: Response) => {
    try {
      const queue = new Queue("clip-processing", {
        connection: getRedisClient(),
      });

      const jobId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      const job = await queue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const state = await job.getState();

      return res.status(200).json({
        jobId,
        status: state,
        progress: job.progress,
        result: state === "completed" ? job.returnvalue : null,
        error: state === "failed" ? job.failedReason : null,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  };

  const getClips = async (_req: Request, res: Response) => {
    return res.status(200).json({ clips: [] });
  };

  return { uploadFile, uploadFromUrl, getJobStatus, getClips };
}

export { createClipController };
