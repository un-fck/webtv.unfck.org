import type { TranscriptionProvider, NormalizedTranscript } from "./types";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;

export const assemblyai: TranscriptionProvider = {
  name: "assemblyai",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: true,
  },

  async transcribe(audioUrl, opts) {
    // Submit
    const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        language_code: opts?.language,
      }),
    });
    if (!submitRes.ok)
      throw new Error(`AssemblyAI submit failed: ${await submitRes.text()}`);
    const { id: transcriptId } = (await submitRes.json()) as { id: string };

    // Poll
    let result: any;
    for (let i = 0; ; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: ASSEMBLYAI_API_KEY } },
      );
      result = await pollRes.json();
      if (result.status === "completed") break;
      if (result.status === "error")
        throw new Error(`AssemblyAI error: ${result.error}`);
      if (i % 6 === 5)
        console.log(`  [AssemblyAI] Still processing... (${(i + 1) * 5}s)`);
    }

    // Normalize utterances
    const utterances = (result.utterances || []).map((u: any) => ({
      speaker: u.speaker,
      start: u.start,
      end: u.end,
      text: u.text,
    }));

    return {
      provider: "assemblyai",
      language: result.language_code || opts?.language || "en",
      fullText: result.text || "",
      utterances,
      durationMs: result.audio_duration ? result.audio_duration * 1000 : 0,
      raw: result,
    } satisfies NormalizedTranscript;
  },
};
