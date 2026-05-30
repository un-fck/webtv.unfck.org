import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { apiLanguage } from "./utils";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;

/**
 * AssemblyAI provider, parameterized by speech model so we can benchmark the
 * legacy default (Universal-2) against Universal-3 Pro. When `speechModels` is
 * set it is sent as the `speech_models` array (Universal-3 Pro requires it and
 * has no default); the array form also enables per-language fallback, since
 * universal-3-pro only covers en/es/pt/fr/de/it and falls back to universal-2.
 */
function makeAssemblyai(
  name: string,
  label: string,
  model: string,
  speechModels?: string[],
): TranscriptionProvider {
  return {
    name,
    label,
    model,
    capabilities: {
      speakerIdentification: false,
      paragraphSegmentation: false,
      wordTimestamps: true,
    },

    async transcribe(audioUrl, opts) {
      const body: Record<string, unknown> = {
        audio_url: audioUrl,
        speaker_labels: true,
        language_code: apiLanguage(opts?.language),
      };
      if (speechModels) body.speech_models = speechModels;

      const submitRes = await fetch(
        "https://api.assemblyai.com/v2/transcript",
        {
          method: "POST",
          headers: {
            authorization: ASSEMBLYAI_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!submitRes.ok)
        throw new Error(`AssemblyAI submit failed: ${await submitRes.text()}`);
      const { id: transcriptId } = (await submitRes.json()) as { id: string };

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
          console.log(`  [${name}] Still processing... (${(i + 1) * 5}s)`);
      }

      const utterances = (result.utterances || []).map((u: any) => ({
        speaker: u.speaker,
        start: u.start,
        end: u.end,
        text: u.text,
      }));

      const audioSeconds: number | undefined = result.audio_duration;
      return {
        provider: name,
        language: result.language_code || opts?.language || "en",
        fullText: result.text || "",
        utterances,
        durationMs: audioSeconds ? audioSeconds * 1000 : 0,
        usage: audioSeconds ? { audioSeconds } : undefined,
        raw: result,
      } satisfies NormalizedTranscript;
    },
  };
}

export const assemblyaiUniversal2 = makeAssemblyai(
  "assemblyai-universal-2",
  "AssemblyAI Universal-2",
  "universal-2",
);
export const assemblyaiUniversal3Pro = makeAssemblyai(
  "assemblyai-universal-3-pro",
  "AssemblyAI Universal-3 Pro",
  "universal-3-pro",
  ["universal-3-pro", "universal-2"],
);
