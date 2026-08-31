import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "path";
import fs from "fs";

// point to bundled ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegPath!);

interface SelectedClip {
  start: number;
  end: number;
  description: string;
}

interface ClipOutput {
  localPath: string;
  fileName: string;
  duration: number;
  url?: string;
}

const RATIO_FILTERS: Record<string, string> = {
  "9:16": "crop=ih*9/16:ih,scale=1080:1920",
  "1:1": "crop=ih:ih,scale=1080:1080",
  "4:5": "crop=ih*4/5:ih,scale=1080:1350",
  "16:9": "scale=1920:1080",
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

const cutClip = (
  inputPath: string,
  outputPath: string,
  start: number,
  duration: number,
  ratio: string,
): Promise<void> => {
  const FFmpegTimeoutMs = 180_000;

  return new Promise((resolve, reject) => {
    const filter = RATIO_FILTERS[ratio] ?? RATIO_FILTERS["16:9"];

    const timer = setTimeout(() => {
      reject(new Error(`FFmpeg timed out after ${FFmpegTimeoutMs}ms while processing ${inputPath}`));
    }, FFmpegTimeoutMs);

    console.log(`🎬 FFmpeg start: ${start}s for ${duration}s -> ${outputPath}`);

    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .videoFilters(filter)
      .audioCodec("aac")
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "superfast",
        "-crf", "28",
        "-threads", "1",
        "-movflags", "+faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        clearTimeout(timer);
        console.log(`✅ FFmpeg success: ${outputPath}`);
        resolve();
      })
      .on("error", (err: Error) => {
        clearTimeout(timer);
        console.error("FFmpeg Error:", err.message);
        reject(err);
      })
      .run();
  });
};

export const generateClips = async (
  inputPath: string,
  clips: SelectedClip[],
  ratio: string,
  jobId: string, 
): Promise<ClipOutput[]> => {
  const outputDir = path.join(process.cwd(), "temp", "clips");

  // create output dir if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: ClipOutput[] = [];

  console.log(`🔧 Starting FFmpeg generation for ${clips.length} selected clips`);

  for (const [index, clip] of clips.entries()) {
    const clipDuration = clip.end - clip.start;
    if (clipDuration <= 0) {
      console.warn(`Skipping invalid clip window at index ${index}: ${clip.start} -> ${clip.end}`);
      continue;
    }

    const slug = slugify(clip.description || `clip-${index + 1}`);
    const fileName = `${slug}-${Math.round(clip.start)}.mp4`;
    const outputPath = path.join(outputDir, fileName);

    try {
      console.log(`📦 Generating clip ${index + 1}/${clips.length}: ${clip.start}s to ${clip.end}s -> ${fileName}`);
      await cutClip(inputPath, outputPath, clip.start, clipDuration, ratio);

      results.push({
        localPath: outputPath,
        fileName,
        duration: clipDuration,
      });
    } catch (err) {
      console.error(`Failed to generate clip ${index}:`, err);
    }
  }

  return results;
};
