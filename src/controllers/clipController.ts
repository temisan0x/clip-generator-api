import type { Request, Response } from "express";
import { uploadToCloudinary } from "../services/cloudinary";
import { transcribeMedia } from "../services/transcribe";
import { selectClips } from "../services/aiSelector";
import { generateClips } from "../services/ffmpeg";
import fs from "fs";

function createClipController() {
  const uploadFile = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const { prompt, ratio } = req.body;
      const targetRatio = ratio || "16:9";

      if (!prompt) {
        res
          .status(400)
          .json({ error: "A prompt describing your clips is required" });
        return;
      }

      const tempFilePath = req.file.path;
      const mimeType = req.file.mimetype;

      // step 1 — transcribe (temp file still on disk)
      const transcript = await transcribeMedia(tempFilePath, mimeType);

      // step 2 — get duration from cloudinary without deleting temp yet
      // upload original — but we need duration first, so we peek at it via ffprobe
      // simpler: upload original first, save duration, then re-use temp for ffmpeg
      // PROBLEM: uploadToCloudinary deletes temp file
      // SOLUTION: copy temp file before uploading
      const tempCopyPath = tempFilePath + ".copy.mp4";
      fs.copyFileSync(tempFilePath, tempCopyPath);

      // upload original (deletes tempFilePath)
      const uploaded = await uploadToCloudinary(tempFilePath);

      // step 3 — ai clip selection using duration from cloudinary
      const selectedClips = await selectClips(
        transcript,
        prompt,
        targetRatio,
        uploaded.duration ?? 0,
      );

      // step 4 — cut clips using the copy
      const generatedClips = await generateClips(
        tempCopyPath,
        selectedClips,
        targetRatio,
      );

      // clean up copy
      if (fs.existsSync(tempCopyPath)) fs.unlinkSync(tempCopyPath);

      // step 5 — upload each clip to cloudinary
      const clipUrls = await Promise.all(
        generatedClips.map(async (clip, index) => {
          const result = await uploadToCloudinary(
            clip.localPath,
            "auto",
            "clip-generator/clips",
          );
          //delete local file after upload
          if (fs.existsSync(clip.localPath)) fs.unlinkSync(clip.localPath);

          return {
            url: result.url,
            duration: clip.duration,
            publicId: result.publicId,
            description: selectedClips[index]?.description || "",
          };
        }),
      );

      res.status(200).json({
        message: "Clips generated successfully",
        original: uploaded,
        prompt,
        ratio: targetRatio,
        transcript,
        selectedClips,
        clips: clipUrls,
      });
    } catch (error: any) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      const tempCopyPath = req.file?.path + ".copy.mp4";
      if (tempCopyPath && fs.existsSync(tempCopyPath))
        fs.unlinkSync(tempCopyPath);

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
