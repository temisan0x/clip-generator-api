import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import clipQueue from "../queue/clipQueue";
import { Queue } from "bullmq";
import getRedisClient from "../config/redis";
import { downloadFromUrl } from "../utils/downloadFromUrl";
import path from "path";
import fs from "node:fs";

const cleanupUploadedFile = (filePath?: string) => {
  if (!filePath) return;
  if (!fs.existsSync(filePath)) return;

  try {
    fs.unlinkSync(filePath);
    console.log(`🧹 Deleted unqueued upload: ${filePath}`);
  } catch (error: any) {
    console.error(`⚠️ Failed to delete upload ${filePath}:`, error.message);
  }
};

const cleanupDirectory = (dirPath?: string) => {
  if (!dirPath) return;
  if (!fs.existsSync(dirPath)) return;

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`🧹 Deleted temp directory: ${dirPath}`);
  } catch (error: any) {
    console.error(`⚠️ Failed to delete temp directory ${dirPath}:`, error.message);
  }
};

function createClipController() {
  const uploadFile = async (req: Request, res: Response) => {
    let jobQueued = false;

    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const { prompt, ratio } = req.body;

      if (!prompt) {
        cleanupUploadedFile(req.file.path);
        res
          .status(400)
          .json({ error: "A prompt describing your clips is required" });
        return;
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
        },
        { jobId },
      );
      jobQueued = true;

      res.status(202).json({
        message: "Job queued successfully",
        jobId,
        statusUrl: `/api/job/${jobId}/status`,
      });
    } catch (error: any) {
      if (!jobQueued) {
        cleanupUploadedFile(req.file?.path);
      }

      console.error("Full error:", error);
      res.status(500).json({ error: error.message || JSON.stringify(error) });
    }
  };

  const uploadFromUrl = async (req: Request, res: Response) => {
    let filePath: string | undefined;
    let cleanupDir: string | undefined;

    try {
      const body = req.body || {};
      const url = body.url || req.body.url;
      const prompt = body.prompt || req.body.prompt;
      const ratio = body.ratio || req.body.ratio || "9:16";

      if (!url) {
        res.status(400).json({ error: "A video URL is required" });
        return;
      }

      if (!prompt) {
        res
          .status(400)
          .json({ error: "A prompt describing your clips is required" });
        return;
      }

      const urlDownloadsDir = path.join(process.cwd(), "temp", "url-downloads");
      const downloaded = await downloadFromUrl(url, urlDownloadsDir);
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
          ratio: ratio || "16:9",
          cleanupDir,
        },
        { jobId },
      );

      res.status(202).json({
        message: "Job queued successfully",
        jobId,
        statusUrl: `/api/job/${jobId}/status`,
      });
    } catch (error: any) {
      cleanupUploadedFile(filePath);
      cleanupDirectory(cleanupDir);
      console.error("Full error:", error);
      res.status(500).json({ error: error.message || JSON.stringify(error) });
    }
  };

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
        res.status(404).json({ error: "Job not found" });
        return;
      }

      const state = await job.getState();
      const progress = job.progress;
      const result = state === "completed" ? job.returnvalue : null;
      const failReason = state === "failed" ? job.failedReason : null;

      res.status(200).json({
        jobId: req.params.id,
        status: state,
        progress,
        result,
        error: failReason,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  const getClips = async (req: Request, res: Response) => {
    res.status(200).json({ jobId: req.params.id, clips: [] });
  };

  return { uploadFile, uploadFromUrl, getJobStatus, getClips };
}

export { createClipController };
