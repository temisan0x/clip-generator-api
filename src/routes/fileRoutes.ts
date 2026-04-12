import express from "express";
import path from "path";
import { createUpload } from "../config/multerConfig";
import { createClipController } from "../controllers/clipController";
import { statusLimiter, uploadLimiter } from "../config/rateLimitConfig";

function createFileRouter() {
  const router = express.Router();
  const uploadsDir = path.join(__dirname, "../../uploads");
  const upload = createUpload(uploadsDir);

  const { uploadFile, uploadFromUrl, getJobStatus, getClips } = createClipController();

 router.post("/upload", uploadLimiter, upload.single("file"), uploadFile);
  router.post("/upload-url", uploadLimiter, uploadFromUrl);
  router.get("/job/:id/status", statusLimiter, getJobStatus);
  router.get("/job/:id/clips", getClips);

  return router;
}

export { createFileRouter };
