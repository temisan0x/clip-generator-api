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
  videoDuration: number
): Promise<SelectedClip[]> => {
   console.log("GROQ KEY in selector:", process.env.GROQ_API_KEY ? "loaded ✅" : "missing ❌");
 
  
  const transcriptText = transcript
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`)
    .join("\n");

const systemPrompt = `You are a world-class short-form video editor specializing in turning podcasts, interviews, and performances into viral TikTok/Reels/Instagram clips.

STRICT RULES (follow exactly):
- Each clip must be between 10 and 60 seconds long.
- Always return EXACTLY 5 clips, ranked from most interesting to least.
- Focus ONLY on the most engaging, surprising, emotional, or insightful moments.
- Prioritize strong hooks, punchlines, key revelations, emotional peaks, memorable quotes, or standout performance moments.
- Content must be in English only — skip or exclude segments in other languages.
- Never exceed the total video duration (${videoDuration.toFixed(1)} seconds).
- Clips can slightly overlap if it makes sense.
- Target aspect ratio: ${ratio} (keep energy high and pacing fast).
- Favor moments strong enough to stand alone with custom on-screen text overlays added later.

Return ONLY a valid JSON array with this exact format, no explanation, no markdown, no extra text:

[
  {
    "start": number,
    "end": number,
    "description": "Short catchy description of why this moment is great"
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

    clips = clips.slice(0, 5).map(clip => ({
      start: Math.max(0, Number(clip.start)),
      end: Math.min(Number(clip.end), videoDuration),
      description: String(clip.description || "Interesting moment")
    }));

    clips = clips.filter(clip => (clip.end - clip.start) >= 10);

    return clips.length > 0 ? clips : []; 
  } catch (e) {
    console.error("JSON Parse Error from Groq:", raw);
    throw new Error("Failed to parse clips from AI");
  }
};