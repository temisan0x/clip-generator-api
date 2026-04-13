import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);
const MIN_VALID_DOWNLOAD_SIZE = 50_000;

export const downloadFromUrl = async (
  url: string,
  outputRootDir: string,
): Promise<{ filePath: string; mimeType: string; cleanupDir: string }> => {

  if (/youtube\.com|youtu\.be/.test(url)) {
    throw new Error(
      "YouTube URLs are not currently supported. Please download the video and upload it as a file instead."
    );
  }

  if (!fs.existsSync(outputRootDir)) {
    fs.mkdirSync(outputRootDir, { recursive: true });
  }

  const sessionDir = path.join(
    outputRootDir,
    `url-download-${Date.now()}-${randomUUID().slice(0, 8)}`
  );
  fs.mkdirSync(sessionDir, { recursive: true });

  const outputTemplate = path.join(sessionDir, "source.%(ext)s");
  console.log(`⬇️ Starting download: ${url}`);

  try {
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--retries", "8",
      "--fragment-retries", "8",
      "--abort-on-unavailable-fragment",
      "--output", outputTemplate,
      "--force-overwrites",
      "--no-part",
      "--merge-output-format", "mp4",
      url,
    ];

    await execFilePromise("yt-dlp", args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180_000,
    });

    const files = fs.readdirSync(sessionDir);
    const finalFile = files.find(
      (f) => f.endsWith(".mp4") && !f.includes(".part")
    );

    if (!finalFile) throw new Error("No output file found after download");

    const filePath = path.join(sessionDir, finalFile);
    const size = fs.statSync(filePath).size;

    if (size < MIN_VALID_DOWNLOAD_SIZE) {
      throw new Error("Downloaded file is too small or corrupted");
    }

    console.log(`✅ Download successful! Size: ${(size / (1024 * 1024)).toFixed(1)} MB`);

    return { filePath, mimeType: "video/mp4", cleanupDir: sessionDir };

  } catch (err: any) {
    console.error("Download error:", err.message);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    throw new Error(`Download failed: ${err.message}`);
  }
};