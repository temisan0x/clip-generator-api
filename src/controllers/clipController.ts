import type { Request, Response } from "express";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { v4 as uuidv4 } from "uuid";

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

      // step 1 — upload to cloudinary
      const uploaded = await uploadToCloudinary(req.file.path);

      // step 2 — transcribe
      const fileName = `${uuidv4()}.mp4`;
      const transcript = await transcribeMedia(uploaded.url, fileName);

      // step 3 — ai clip selection
      const selectedClips = await selectClips(transcript, prompt, ratio || "16:9");

      res.status(200).json({
        message: "File processed successfully",
        file: uploaded,
        prompt,
        ratio: ratio || "16:9",
        transcript,
        selectedClips,
      });
    } catch (error: any) {
      console.error("Full error:", error);
      res.status(500).json({ error: error.message || JSON.stringify(error) });
    }
  };

  const getJobStatus = async (req: Request, res: Response) => {
    res.status(200).json({ jobId: req.params.id, status: "pending" });
  };

  const getClips = async (req: Request, res: Response) => {
    res.status(200).json({ jobId: req.params.id, clips: [] });
  };

  return { uploadFile, getJobStatus, getClips };
}

export { createClipController };