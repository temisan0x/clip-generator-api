import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);

const MIN_VALID_DOWNLOAD_SIZE = 50_000;

export const downloadFromUrl = async (
  url: string,
  outputRootDir: string
): Promise<{ filePath: string; mimeType: string; cleanupDir: string }> => {
  
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
      "--force-ipv4",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "--referer", "https://www.youtube.com/",
    ];

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      console.log("🎥 YouTube/Shorts detected");
      args.push(
        "-f", "bv*[height<=720]+ba/bestaudio/best",
        "--merge-output-format", "mp4"
      );
    } else {
      args.push("--merge-output-format", "mp4");
    }

    args.push(url);

    await execFilePromise("yt-dlp", args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180000, // 3 minutes
    });

    // Find the final mp4 file
    const files = fs.readdirSync(sessionDir);
    const finalFile = files.find(f => f.endsWith(".mp4") && !f.includes(".part"));

    if (!finalFile) throw new Error("No output file found after download");

    const filePath = path.join(sessionDir, finalFile);
    const size = fs.statSync(filePath).size;

    if (size < MIN_VALID_DOWNLOAD_SIZE) {
      throw new Error("Downloaded file is too small or corrupted");
    }

    console.log(`✅ Download successful! Size: ${(size / (1024 * 1024)).toFixed(1)} MB`);

    return {
      filePath,
      mimeType: "video/mp4",
      cleanupDir: sessionDir,
    };

  } catch (err: any) {
    console.error("Download error:", err.message);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    throw new Error(`Download failed: ${err.message}`);
  }
};