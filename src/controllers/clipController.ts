import type { Request, Response } from "express";
import { uploadToCloudinary } from "../services/cloudinary";

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

      const uploaded = await uploadToCloudinary(req.file.path);

      res.status(200).json({
        message: "File uploaded successfully",
        file: uploaded,
        prompt,
        ratio: ratio || "16:9",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  const getJobStatus = async (req: Request, res: Response) => {
    // Phase 2 — job queue
    res.status(200).json({ jobId: req.params.id, status: "pending" });
  };

  const getClips = async (req: Request, res: Response) => {
    // Phase 2 — return generated clips
    res.status(200).json({ jobId: req.params.id, clips: [] });
  };

  return { uploadFile, getJobStatus, getClips };
}

export { createClipController };