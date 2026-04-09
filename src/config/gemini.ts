import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

const getGeminiClient = (): GoogleGenAI => {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
};

export default getGeminiClient;