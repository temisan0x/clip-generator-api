import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

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

const cutClip = (
  inputPath: string,
  outputPath: string,
  start: number,
  duration: number,
  ratio: string,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const filter = RATIO_FILTERS[ratio] ?? RATIO_FILTERS["16:9"];

    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .videoFilters(filter)
      .audioCodec("aac")
      .videoCodec("libx264")
      .outputOptions([
        "-preset fast", // faster encoding
        "-crf 23", // good quality/size balance
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => {
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
): Promise<ClipOutput[]> => {
  const outputDir = path.join(process.cwd(), "temp", "clips");

  // create output dir if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: ClipOutput[] = [];

  for (const [index, clip] of clips.entries()) {
    const clipDuration = clip.end - clip.start;
    if (clipDuration <= 0) continue;

    const fileName = `clip-${Date.now()}-${index}-${uuidv4().slice(0, 8)}.mp4`;
    const outputPath = path.join(outputDir, fileName);

    try {
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
