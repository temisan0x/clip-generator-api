import express from "express";
import path from "path";
import { createUpload } from "../config/multerConfig";
import { createClipController } from "../controllers/clipController";

function createFileRouter() {
  const router = express.Router();
  const uploadsDir = path.join(__dirname, "../../uploads");
  const upload = createUpload(uploadsDir);

  const { uploadFile, uploadFromUrl, getJobStatus, getClips } = createClipController();

  router.post("/upload", upload.single("file"), uploadFile);
  router.post("/upload-url", uploadFromUrl); 
  router.get("/job/:id/status", getJobStatus);
  router.get("/job/:id/clips", getClips);

  return router;
}

export { createFileRouter };
