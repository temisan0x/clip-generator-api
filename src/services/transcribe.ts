import { createPartFromUri, createUserContent } from "@google/genai";
import fs from "fs";
import path from "path";
import https from "https";
import ai from "../config/gemini";

// download cloudinary file to temp folder
const downloadFile = (url: string, destPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
};

interface TranscriptSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export const transcribeMedia = async (
  cloudinaryUrl: string,
  fileName: string
): Promise<TranscriptSegment[]> => {
  const tempPath = path.join(__dirname, "../../temp", fileName);

  // download from cloudinary to temp
  await downloadFile(cloudinaryUrl, tempPath);

  // upload to gemini file api
  const uploadedFile = await ai.files.upload({
    file: tempPath,
    config: { mimeType: "video/mp4" },
  });

  // wait for gemini to process the file
  let geminiFile = await ai.files.get({ name: uploadedFile.name! });
  while (geminiFile.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 3000));
    geminiFile = await ai.files.get({ name: uploadedFile.name! });
  }

  if (geminiFile.state === "FAILED") {
    throw new Error("Gemini failed to process the media file");
  }

  // ask gemini for a timestamped transcript
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-04-17",
    contents: createUserContent([
      createPartFromUri(geminiFile.uri!, geminiFile.mimeType!),
      `Transcribe this media file. Return ONLY a JSON array, no markdown, no explanation.
       Each item must have: start (number, seconds), end (number, seconds), text (string).
       Example: [{"start": 0, "end": 4.5, "text": "Welcome to the show"}]`,
    ]),
  });

  // clean up temp file
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

  const raw = response.text?.trim() ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    const segments: TranscriptSegment[] = JSON.parse(cleaned);
    return segments;
  } catch {
    throw new Error(`Failed to parse transcript from Gemini: ${raw}`);
  }
};