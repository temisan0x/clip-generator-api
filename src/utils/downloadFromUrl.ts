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
  if (!fs.existsSync(outputRootDir)) {
    fs.mkdirSync(outputRootDir, { recursive: true });
  }

  const sessionDir = path.resolve(
    path.join(
      outputRootDir,
      `url-download-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ),
  );

  fs.mkdirSync(sessionDir, { recursive: true });

  const outputTemplate = path.join(sessionDir, "source.%(ext)s");

  console.log(`⬇️ Starting download: ${url}`);
  console.log(`📂 Session dir: ${sessionDir}`);

  try {
    const args = [
      "--no-playlist",
      "--no-warnings",
      "--retries",
      "5",
      "--fragment-retries",
      "5",
      "--abort-on-unavailable-fragment",
      "--output",
      outputTemplate,
      "--force-overwrites",
      "--no-part",
      "--force-ipv4",
    ];

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      console.log("🎥 YouTube detected");
      args.push(
        "-f",
        "bv*[height<=720]+ba/bestaudio/best",
        "--merge-output-format",
        "mp4",
      );
    } else {
      args.push("--merge-output-format", "mp4");
    }

    args.push(url);

    await execFilePromise("yt-dlp", args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180000,
    });

    const files = fs.readdirSync(sessionDir);
    const finalFile = files.find(
      (f) => f.endsWith(".mp4") && !f.includes(".part"),
    );

    if (!finalFile) throw new Error("No output file found");

    const filePath = path.resolve(path.join(sessionDir, finalFile));
    const size = fs.statSync(filePath).size;

    console.log("📂 Files in session dir:", fs.readdirSync(sessionDir));

    if (size < MIN_VALID_DOWNLOAD_SIZE) {
      throw new Error("Downloaded file too small");
    }

    console.log(`✅ File ready: ${filePath}`);

    return {
      filePath,
      mimeType: "video/mp4",
      cleanupDir: sessionDir,
    };
  } catch (err: any) {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    throw new Error(`Download failed: ${err.message}`);
  }
};
