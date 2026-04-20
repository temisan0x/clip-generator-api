import type { Request } from "express";
import type { FileFilterCallback } from "multer";
import multer from "multer";
import path from "path";

const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
const INVALID_FILE_TYPE = "Invalid file type. Only video and audio files are allowed.";

function createUpload(uploadsDir: string) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      cb: FileFilterCallback,
    ) => {
      if (
        file.mimetype.startsWith("video/") ||
        file.mimetype.startsWith("audio/")
      ) {
        cb(null, true);
      } else {
        cb(new Error(INVALID_FILE_TYPE));
      }
    },
  });
}

export { createUpload };