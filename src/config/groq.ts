import { Groq } from "groq-sdk";

let client: Groq | null = null;

export const getGroqClient = (): Groq => {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY?.trim();

    if (!apiKey || apiKey.length < 20) {
      throw new Error("❌ GROQ_API_KEY is missing or invalid in .env file");
    }

    client = new Groq({ 
      apiKey,
    });
  }
  return client;
};