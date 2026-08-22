/**
 * STT provider configuration — the single source of truth for which provider
 * transcribes each language, plus analysis-model env wiring.
 *
 * Routing was chosen from the manual provider eval (eval/analysis/out/SYNTHESIS.md).
 * The About/Methodology page renders this map with human-readable names.
 */
import type { TranscriptionProvider } from "./types";
import { getProvider } from "./registry";

export {
  getAnalysisModel,
  getAnalysisModelMini,
  getAnalysisModelNano,
} from "./models";

/**
 * Language (BCP-47 code or 'floor') → provider registry key.
 * THE place to change which model transcribes which language.
 */
export const STT_ROUTING: Record<string, string> = {
  // Multilingual original audio. Switched from gemini-3-flash 2026-07-10 after
  // the floor bake-off (eval/analysis/SYNTHESIS.md §13): Melia beat Gemini on
  // paired floor WER, is near-perfectly speaker-calibrated at every meeting
  // length, carries per-word language labels, and — decisively — sits in the
  // classic-ASR error family (zero name hallucinations across all probes,
  // where Gemini reproduced Keita→"Kanem" the same day).
  floor: "speechmatics-melia-1",
  // English switched from assemblyai-universal-3-5-pro 2026-07-30 (SYNTHESIS §16)
  // on OMISSION, a criterion the en bake-off never scored. AssemblyAI silently
  // drops spans of speech on long audio: over the 24-session bake-off corpus
  // (27.5 h) it left out 0.580% of the audio against Azure's 0.082% — 7× more —
  // and 879 words that Azure captured against 370 the other way. It is also
  // unstable: 215 words of pass-to-pass divergence where Azure had none.
  //
  // The trigger was a member-state complaint on A/80/PV.106, where "…reassess our
  // engagement, [participation, and funding.]" was cut mid-sentence, plus ~30 s
  // more of the same statement and a 56-word passage from Mexico's. All 10 of 10
  // AssemblyAI re-runs reproduced the core drop; Azure got it right 2/2.
  //
  // Rejected alternatives: re-transcribing (10/10 runs reproduce the defect) and
  // chunking (a 3-pass × 5-level sweep found only 60-min chunks beat the whole
  // file, and 30/15/5-min windows were ~2× WORSE — chunk length changes *which*
  // spans are lost, not how many).
  //
  // Knowingly accepted, from the bake-off: Azure is ~1.46× dearer ($0.306 vs
  // $0.21/audio-hour), renders entities/document symbols worse (AssemblyAI's
  // keyterms_prompt has no Azure equivalent), and the model behind "enhanced
  // mode" is unnamed and unpinnable. The judgement is that a wrong word is a
  // visible error a reader can catch, while a missing sentence is invisible and
  // reads as censorship.
  en: "azure-llm-speech",
  // fr/es/ar/ru switched from azure-gpt-4o-transcribe 2026-07-14 (SYNTHESIS §15).
  // Paired WER over the standing corpus: fr −4.4 (10/10 sessions), es −3.5
  // (10/10), ru −1.7 (11/12) — all CIs exclude zero. Arabic ties on WER (89.7 vs
  // 89.5) but wins decisively on *fidelity*: 0.1% off-script vs gpt-4o's 4.4%,
  // i.e. the incumbent was the one leaking Latin into Arabic (the §5 azure
  // cross-language class). Coverage 96–98% vs 79–87%. Same Azure resource, so no
  // new vendor.
  //
  // Known trade-offs, accepted: coarser paragraphs (we merge same-speaker
  // phrases, so a long statement becomes one block — §15/paragraph analysis);
  // Spanish corrupts document symbols (`S-2026/426` for `S/2026/426`); Arabic
  // spells the meeting number out instead of using digits.
  //
  // ⚠️ The model behind "enhanced mode" is UNNAMED and UNPINNABLE, and Microsoft
  // has silently replaced it once. Guard with eval/analysis/regression-azure-llm.ts.
  fr: "azure-llm-speech",
  es: "azure-llm-speech",
  ar: "azure-llm-speech",
  ru: "azure-llm-speech",
  zh: "alibaba-fun-asr",
};

/** Fallback for languages not in STT_ROUTING. */
export const STT_DEFAULT_PROVIDER = "gemini-3-flash";

/** Select the STT provider for a given language track. */
export function getSTTProvider(language?: string): TranscriptionProvider {
  const key = (language && STT_ROUTING[language]) || STT_DEFAULT_PROVIDER;
  return getProvider(key);
}
