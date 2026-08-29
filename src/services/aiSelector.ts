import { getGroqClient } from "../config/groq";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface SelectedClip {
  start: number;
  end: number;
  description: string;
}

export const selectClips = async (
  transcript: TranscriptSegment[],
  prompt: string,
  ratio: string,
  videoDuration: number,
): Promise<SelectedClip[]> => {
  console.log(
    "GROQ KEY in selector:",
    process.env.GROQ_API_KEY ? "loaded ✅" : "missing ❌",
  );

  const transcriptText = transcript
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`)
    .join("\n");

  const systemPrompt = `You are a world-class short-form video editor specializing in turning livestream events, fight press conferences, and high-drama broadcasts into viral TikTok/YouTube Shorts/Instagram clips.

STRICT RULES (follow exactly):
- Each clip must be between 10 and 35 seconds long to maximize completion rate metrics.
- Always return EXACTLY 5 clips, ranked from most viral potential to least.
- Prioritize high-conflict moments: ragebaits, severe call-outs, chaotic interruptions, crowd-pleasing punchlines, or intense eye contact/staredowns.
- Ensure the start timestamp captures the build-up to the conflict, and the end timestamp leaves viewers wanting to see the immediate aftermath.
- Target aspect ratio: ${ratio}. The final output will feature a blurred canvas background with an official match-up banner graphic stacked at the top. 
- Ensure the moments selected keep critical on-screen subjects natively centered so corner watermarks, sponsor logos, and QR codes remain perfectly untouched and visible within the frame.

For each clip, you must generate a high-retention text hook optimized for clean, white, outlined overlay text. The hook must use high-engagement, modern internet slang (e.g., "RAGEBAITED", "CAUGHT LACKING", "HE REALLY SAID THIS", "PURE CHAOS") in ALL CAPS with relatable emojis.

Return ONLY a valid JSON array with this exact format, no explanation, no markdown, no extra text:

[
  {
    "start": number,
    "end": number,
    "description": "ALL CAPS TEXT HOOK WITH EMOJIS FOR ON-SCREEN OVERLAY 💀😂"
  }
]`;

  const userPrompt = `Transcript:\n${transcriptText}\n\nUser additional request: ${prompt || "Find the most interesting parts"}`;

  const response = await getGroqClient().chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2048,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    let clips: SelectedClip[] = JSON.parse(cleaned);

    clips = clips.slice(0, 5).map((clip) => ({
      start: Math.max(0, Number(clip.start)),
      end: Math.min(Number(clip.end), videoDuration),
      description: String(clip.description || "Interesting moment"),
    }));

    clips = clips.filter((clip) => clip.end - clip.start >= 10);

    return clips.length > 0 ? clips : [];
  } catch (e) {
    console.error("JSON Parse Error from Groq:", raw);
    throw new Error("Failed to parse clips from AI");
  }
};
