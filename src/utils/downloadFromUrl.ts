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

  const sessionDir = path.join(outputRootDir, `url-download-${Date.now()}-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const outputTemplate = path.join(sessionDir, "source.%(ext)s");

  console.log(`⬇️ Starting download: ${url}`);

  try {
    const commandArgs = [
      "--no-playlist",
      "--no-warnings",
      "--retries", "5",
      "--fragment-retries", "5",
      "--abort-on-unavailable-fragment",
      "--paths", `temp:${sessionDir}`,
      "--output", outputTemplate,
      "--force-ipv4",                    // Helps with Nigerian networks
    ];

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      console.log("🎥 YouTube/Shorts detected");
      commandArgs.push(
        "-f", "bv*[height<=720]+ba/bestaudio/best",
        "--merge-output-format", "mp4"
      );
    } else {
      commandArgs.push("--merge-output-format", "mp4");
    }

    commandArgs.push(url);

    const { stdout, stderr } = await execFilePromise("yt-dlp", commandArgs, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180000, // 3 minutes
    });

    if (stdout) console.log(stdout.trim());
    if (stderr) console.warn(stderr.trim());

    // Find the final file
    const files = fs.readdirSync(sessionDir);
    const finalFile = files.find(f => 
      f.endsWith(".mp4") && !f.includes(".part")
    );

    if (!finalFile) throw new Error("No output file found after download");

    const filePath = path.join(sessionDir, finalFile);
    const fileSize = fs.statSync(filePath).size;

    if (fileSize < MIN_VALID_DOWNLOAD_SIZE) {
      throw new Error("Downloaded file is too small");
    }

    console.log(`✅ Download successful! Size: ${(fileSize / (1024*1024)).toFixed(1)} MB`);
    
    return {
      filePath,
      mimeType: "video/mp4",
      cleanupDir: sessionDir,
    };

  } catch (error: any) {
    console.error("Download error:", error.message);
    // Clean up on failure
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    throw new Error(`URL download failed: ${error.message}`);
  }
};