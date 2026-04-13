// src/services/transcribe.ts
import fs from "fs";
import { getGroqClient } from "../config/groq";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export const transcribeMedia = async (
  tempFilePath: string,
  mimeType: string,
): Promise<TranscriptSegment[]> => {
  
  console.log("🧪 Transcription path received:", tempFilePath);
  console.log("🧪 Exists?", fs.existsSync(tempFilePath));

  if (!fs.existsSync(tempFilePath)) {
    throw new Error("File not found for transcription");
  }

  const fileSize = fs.statSync(tempFilePath).size;
  console.log(
    `📝 Transcribing... File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
  );

  try {
    const client = getGroqClient();

    const transcription = (await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
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
    console.error("Groq Transcription Error:", error.message || error);

    if (error?.status === 400) {
      throw new Error(
        "Groq could not process the audio. File might be corrupted or too short.",
      );
    }
    if (error?.status === 429) {
      throw new Error("Groq rate limit reached. Try again later.");
    }

    throw new Error(`Transcription failed: ${error.message}`);
  }
};
