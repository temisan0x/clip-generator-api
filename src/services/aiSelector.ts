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

STRICT TIMING RULES (follow exactly):
- Each clip must combine multiple consecutive dialogue segments so that the length is strictly between 10 and 35 seconds long to maximize completion rate metrics.
- Always return EXACTLY 5 clips, ranked from most viral potential to least. If the transcript contains no clean segments meeting the content criteria, return fewer than 5 clips rather than forcing a match.
- Target aspect ratio: ${ratio}.

CONTENT CRITERIA:
- Find the highest-energy, entertaining segments in this transcript — think sports rivalry banter, comedic roasts, over-the-top trash talk, or crowd-hyping moments. Clips should feel like a fun highlight reel, not a news story.
- Each clip needs a clear build-up and a punchy, funny conclusion.

STRICT SAFETY FILTER (DO NOT select any moment involving):
- Allegations of abuse, violence, or criminal conduct.
- Serious accusations against a named individual (e.g., words like racist, supremacist, etc. must be skipped).
- Content referencing minors in any context.
- Anything that isn't clearly comedic, competitive banter framed as entertainment.

For each clip, generate a short, clean, descriptive summary sentence of what happens during that scene to be used as a filename. Do NOT use all caps, do NOT use punctuation, and do NOT include any emojis or special symbols. Keep it to alphanumeric characters and spaces only.

Return ONLY a valid JSON array with this exact format, no explanation, no markdown, no extra text:

[
  {
    "start": number,
    "end": number,
    "description": "A short clean descriptive sentence summarizing the scene action"
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

    const validClips = clips.filter((clip) => clip.end - clip.start >= 10);

    if (validClips.length > 0) {
      return validClips.slice(0, 5);
    }

    const fallbackClips = transcript
      .filter((segment) => segment.end > segment.start)
      .slice(0, 5)
      .map((segment, index) => ({
        start: Math.max(0, Number(segment.start)),
        end: Math.min(Math.max(Number(segment.end), Number(segment.start) + 5), videoDuration),
        description: `Highlight ${index + 1}: ${segment.text.trim() || "Interesting moment"}`,
      }))
      .filter((clip) => clip.end - clip.start >= 5);

    if (fallbackClips.length > 0) {
      return fallbackClips.slice(0, 5);
    }

    return [];
  } catch (e) {
    console.error("JSON Parse Error from Groq:", raw);
    throw new Error("Failed to parse clips from AI");
  }
};
