import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { apiLanguage } from "./utils";

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!;

/**
 * AssemblyAI provider, parameterized by speech model so we can benchmark the
 * legacy default (Universal-2) against the Pro line. When `speechModels` is set
 * it is sent as the `speech_models` array (the Pro models require it and have no
 * default); the array form also enables per-language fallback, since the Pro
 * models cover only a subset of AssemblyAI's ~99 languages and fall back to
 * universal-2 for the rest. Universal-3 Pro covers en/es/pt/fr/de/it;
 * Universal-3.5 Pro widens that to 18 languages (adds ar/zh/ja/hi/he/tr/vi/nl/
 * da/fi/no/sv) — but **not Russian**, which still falls back to universal-2.
 *
 * Fallback is decided per *request*, from the dominant detected language — not
 * per segment. So a single file mixing a supported and an unsupported language
 * is served entirely by whichever model the dominant language selects. This is
 * why the multilingual "floor" track stays on Gemini rather than AssemblyAI.
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
      const language = apiLanguage(opts?.language);
      const body: Record<string, unknown> = {
        audio_url: audioUrl,
        speaker_labels: true,
      };
      if (language) {
        body.language_code = language;
      } else {
        // Multilingual "floor" track: no fixed language. Without this flag the
        // API defaults to language_code "en_us" (JSON.stringify drops the
        // undefined language_code, and language_detection defaults to false),
        // which silently transcribed the floor as US English — see
        // eval/analysis/PLAN-universal-3.5-pro.md §1.
        body.language_detection = true;
      }
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

      // Which model actually served the request — with a speech_models array
      // the API may fall back (e.g. ru → universal-2); this is the only signal.
      if (result.speech_model_used || result.speech_model)
        console.log(
          `  [${name}] speech_model_used: ${result.speech_model_used ?? result.speech_model}` +
            (result.language_code ? ` (language: ${result.language_code})` : ""),
        );

      const utterances = (result.utterances || []).map((u: any) => ({
        speaker: u.speaker,
        start: u.start,
        end: u.end,
        text: u.text,
        words: Array.isArray(u.words)
          ? u.words.map((w: any) => ({
              text: w.text,
              start: w.start,
              end: w.end,
              confidence: w.confidence,
              speaker: w.speaker,
            }))
          : undefined,
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
export const assemblyaiUniversal35Pro = makeAssemblyai(
  "assemblyai-universal-3-5-pro",
  "AssemblyAI Universal-3.5 Pro",
  "universal-3-5-pro",
  ["universal-3-5-pro", "universal-2"],
);
