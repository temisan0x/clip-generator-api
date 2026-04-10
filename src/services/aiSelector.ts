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
  
  const transcriptText = transcript
    .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`)
    .join("\n");

  const systemPrompt = `You are a professional short-form video editor for TikTok, Reels & YouTube Shorts.

Rules (VERY IMPORTANT):
- Video total duration is ONLY ${videoDuration.toFixed(1)} seconds.
- NEVER create a clip longer than the actual video duration.
- Each clip must have "end" ≤ ${videoDuration.toFixed(1)}
- Make clips punchy: ideal length 8 - 18 seconds for this short video.
- If user asks for 60-second clips but video is short, create the best possible short versions.
- Target aspect ratio is ${ratio}. Adjust pacing and energy accordingly.
- Return ONLY valid JSON array, no explanation, no markdown.

Example output:
[
  {"start": 0, "end": 9, "description": "Strong hook"},
  {"start": 7, "end": 16, "description": "Main punchline"}
]`;

  const response = await getGroqClient().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: `Transcript:\n${transcriptText}\n\nUser request: ${prompt}` 
      },
    ],
    temperature: 0.4,
    max_tokens: 600,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    let clips: SelectedClip[] = JSON.parse(cleaned);

    // Safety clamp
    clips = clips.map(clip => ({
      ...clip,
      end: Math.min(Number(clip.end), videoDuration)
    }));

    return clips;
  } catch (e) {
    console.error("JSON Parse Error from Groq:", raw);
    throw new Error("Failed to parse clips from Groq");
  }
};