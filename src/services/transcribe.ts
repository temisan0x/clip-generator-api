import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { getGroqClient } from "../config/groq";

ffmpeg.setFfmpegPath(ffmpegPath!);

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

const compressForTranscription = async (inputPath: string): Promise<string> => {
  const dir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(dir, `${baseName}-transcribe.wav`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-vn",
        "-ac 1",
        "-ar 16000",
        "-b:a 64k",
        "-f wav",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });

  return outputPath;
};

export const transcribeMedia = async (
  tempFilePath: string,
  mimeType: string,
): Promise<TranscriptSegment[]> => {
  if (!fs.existsSync(tempFilePath)) {
    throw new Error("File not found for transcription");
  }

  const fileSize = fs.statSync(tempFilePath).size;
  console.log(
    `📝 Transcribing... File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
  );

  let inputPath = tempFilePath;
  let compressedPath: string | null = null;

  try {
    if (fileSize > 15 * 1024 * 1024) {
      console.log("📉 File is too large for Groq transcription; compressing audio before upload...");
      compressedPath = await compressForTranscription(tempFilePath);
      inputPath = compressedPath;
    }

    const client = getGroqClient();

    const transcription = (await client.audio.transcriptions.create({
      file: fs.createReadStream(inputPath),
      model: "whisper-large-v3",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      temperature: 0.0,
    })) as any;

    const segments: TranscriptSegment[] = (transcription.segments ?? []).map(
      (s: any) => ({
        start: Number(s.start.toFixed(2)),
        end: Number(s.end.toFixed(2)),
        text: s.text.trim(),
      }),
    );

    console.log(`✅ Transcription successful → ${segments.length} segments`);
    return segments;
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status;
    const message = error?.message || error?.response?.data?.error?.message || "Unknown error";

    console.error("Groq Transcription Error:", message);

    if (status === 413 || message.includes("Request Entity Too Large")) {
      throw new Error(
        "Transcription failed because the source file is too large for Groq. Try a shorter or smaller video before uploading again.",
      );
    }

    if (status === 400) {
      throw new Error(
        "Groq could not process the audio. File might be corrupted or too short.",
      );
    }
    if (status === 429) {
      throw new Error("Groq rate limit reached. Try again later.");
    }

    throw new Error(`Transcription failed: ${message}`);
  } finally {
    if (compressedPath && fs.existsSync(compressedPath)) {
      fs.unlinkSync(compressedPath);
    }
  }
};
