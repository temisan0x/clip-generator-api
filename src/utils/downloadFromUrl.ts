// src/utils/downloadFromUrl.ts
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFilePromise = promisify(execFile);

const MIN_VALID_DOWNLOAD_SIZE = 50_000;
const MIME_BY_EXTENSION: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

const isPartialFile = (fileName: string) => {
  const normalized = fileName.toLowerCase();
  return (
    normalized.endsWith(".part") ||
    normalized.endsWith(".ytdl") ||
    normalized.includes(".part-frag")
  );
};

const getDownloadedFilePath = (downloadDir: string): string => {
  const candidates = fs
    .readdirSync(downloadDir)
    .map((name) => path.join(downloadDir, name))
    .filter((candidatePath) => {
      if (!fs.statSync(candidatePath).isFile()) return false;
      return !isPartialFile(path.basename(candidatePath));
    })
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

  if (!candidates.length) {
    throw new Error("yt-dlp finished but no output media file was found");
  }

  return candidates[0];
};

const getMimeType = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
};

const isYoutubeUrl = (url: string): boolean =>
  url.includes("youtube.com") || url.includes("youtu.be");

export const downloadFromUrl = async (
  url: string,
  outputRootDir: string,
): Promise<{ filePath: string; mimeType: string; cleanupDir: string }> => {
  if (!fs.existsSync(outputRootDir)) {
    fs.mkdirSync(outputRootDir, { recursive: true });
  }

  const sessionDir = path.join(
    outputRootDir,
    `url-download-${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  fs.mkdirSync(sessionDir, { recursive: true });

  const outputTemplate = path.join(sessionDir, "source.%(ext)s");
  console.log(`⬇️ Starting download: ${url}`);

  try {
    const commandArgs = [
      "--no-playlist",
      "--no-warnings",
      "--paths",
      `temp:${sessionDir}`,
      "--output",
      outputTemplate,
    ];

    if (isYoutubeUrl(url)) {
      console.log("🎥 YouTube/Shorts detected → using optimized yt-dlp command");
      commandArgs.push(
        "-f",
        "bv*[ext=mp4]+ba[ext=m4a]/bestaudio[ext=m4a]/best",
        "--merge-output-format",
        "mp4",
      );
    } else {
      commandArgs.push("--merge-output-format", "mp4");
    }

    commandArgs.push(url);

    const { stdout, stderr } = await execFilePromise("yt-dlp", commandArgs, {
      maxBuffer: 20 * 1024 * 1024,
    });

    if (stdout) console.log(stdout.trim());
    if (stderr) console.warn(stderr.trim());

    const filePath = getDownloadedFilePath(sessionDir);
    const fileSize = fs.statSync(filePath).size;

    if (fileSize < MIN_VALID_DOWNLOAD_SIZE) {
      throw new Error("Downloaded file is empty or corrupted");
    }

    console.log(
      `✅ Download successful! Size: ${(fileSize / (1024 * 1024)).toFixed(1)} MB`,
    );

    return {
      filePath,
      mimeType: getMimeType(filePath),
      cleanupDir: sessionDir,
    };
  } catch (error: any) {
    console.error("Download error:", error.message);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    throw new Error(`URL download failed: ${error.message}`);
  }
};
