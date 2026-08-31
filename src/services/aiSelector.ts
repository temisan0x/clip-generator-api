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

    // If AI returned 5 or more valid clips, return the top 5.
    if (validClips.length >= 5) {
      return validClips.slice(0, 5);
    }

    // If AI returned fewer than 5, attempt to augment with transcript-based fallbacks.
    const needed = Math.max(0, 5 - validClips.length);

    const fallbackCandidates = transcript
      .filter((segment) => segment.end > segment.start)
      .map((segment, index) => {
        const segmentStart = Number(segment.start);
        const segmentEnd = Number(segment.end);
        const fallbackNeeded = !Number.isFinite(segmentEnd) || segmentEnd < segmentStart + 10;

        if (fallbackNeeded) {
          console.warn("Fallback clip timestamp repair triggered; Groq returned invalid/short segment end.", {
            segment,
            segmentStart,
            segmentEnd,
            minRequired: segmentStart + 10,
            videoDuration,
          });
        }

        return {
          start: Math.max(0, segmentStart),
          end: Math.min(Math.max(segmentEnd, segmentStart + 10), videoDuration),
          description: `Highlight ${index + 1}: ${segment.text.trim() || "Interesting moment"}`,
        } as SelectedClip;
      })
      .filter((clip) => clip.end - clip.start >= 10);

    // Exclude fallback clips that duplicate existing AI-selected starts
    const existingStarts = new Set(validClips.map((c) => Math.round(c.start)));
    const uniqueFallbacks = fallbackCandidates.filter((c) => !existingStarts.has(Math.round(c.start)));

    const augmented = [...validClips, ...uniqueFallbacks].slice(0, 5);

    if (augmented.length > 0) return augmented;

    return [];
  } catch (e) {
    console.error("JSON Parse Error from Groq:", raw);
    throw new Error("Failed to parse clips from AI");
  }
};
