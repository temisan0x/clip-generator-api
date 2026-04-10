import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import clipQueue from "../queue/clipQueue";
import { Queue } from "bullmq";
import getRedisClient from "../config/redis";

function createClipController() {
  const uploadFile = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const { prompt, ratio } = req.body;

      if (!prompt) {
        res.status(400).json({ error: "A prompt describing your clips is required" });
        return;
      }

      const jobId = uuidv4();

      await clipQueue().add("process-clip", {
        jobId,
        tempFilePath: req.file.path,
        mimeType: req.file.mimetype,
        prompt,
        ratio: ratio || "16:9",
      });

      res.status(202).json({
        message: "Job queued successfully",
        jobId,
        statusUrl: `/api/job/${jobId}/status`,
      });
    } catch (error: any) {
      console.error("Full error:", error);
      res.status(500).json({ error: error.message || JSON.stringify(error) });
    }
  };

  const getJobStatus = async (req: Request, res: Response) => {
    try {
      const queue = new Queue("clip-processing", { connection: getRedisClient() });
      const jobs = await queue.getJobs(["active", "completed", "failed", "waiting"]);
      const job = jobs.find((j) => j.data.jobId === req.params.id);

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

  return { uploadFile, getJobStatus, getClips };
}

export { createClipController };