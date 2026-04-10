import fs from "fs";
import { getGroqClient } from "../config/groq";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}
  
export const transcribeMedia = async (
  tempFilePath: string,
  mimeType: string
): Promise<TranscriptSegment[]> => {
  const client = getGroqClient();

  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(tempFilePath),
    model: "whisper-large-v3",
    response_format: "verbose_json", // gives us timestamps
    timestamp_granularities: ["segment"],
  }) as any;

  const segments: TranscriptSegment[] = (transcription.segments ?? []).map((s: any) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));

  return segments;
};