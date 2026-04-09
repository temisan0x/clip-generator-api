import getGeminiClient from "../config/gemini";

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
  ratio: string
): Promise<SelectedClip[]> => {
  const transcriptText = transcript
    .map((s) => `[${s.start}s - ${s.end}s]: ${s.text}`)
    .join("\n");

  const systemPrompt = `
You are a video editor AI. You receive a timestamped transcript and a user instruction.
Your job is to select the best segments from the transcript that match the user's intent.

Rules:
- Return ONLY a JSON array, no markdown, no explanation
- Each item must have: start (number), end (number), description (string)
- Merge nearby segments if they form a coherent clip
- Respect the user's requested number of clips if specified
- Each clip should be between 15 and 90 seconds where possible
- Target aspect ratio is ${ratio} — keep that in mind for pacing

Example output:
[{"start": 0, "end": 45, "description": "Punchy intro with strong hook"}]
  `;

  const response = await getGeminiClient().models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\nTranscript:\n${transcriptText}\n\nUser instruction: ${prompt}`,
          },
        ],
      },
    ],
  });

  const raw = response.text?.trim() ?? "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  try {
    const clips: SelectedClip[] = JSON.parse(cleaned);
    return clips;
  } catch {
    throw new Error(`Failed to parse clip selection from Gemini: ${raw}`);
  }
};