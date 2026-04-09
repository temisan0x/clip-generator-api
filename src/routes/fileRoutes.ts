import express from "express";
import { createUpload } from "../config/multerConfig";
import { createClipController } from "../controllers/clipController";

function createFileRouter(uploadsDir: string) {
  const router = express.Router();
  const upload = createUpload(uploadsDir);

  const { uploadFile, getJobStatus, getClips } = createClipController();

  router.post("/upload", upload.single("file"), uploadFile);
  router.get("/job/:id/status", getJobStatus);
  router.get("/job/:id/clips", getClips);

  return router;
}

export { createFileRouter };