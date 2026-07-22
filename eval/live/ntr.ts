/**
 * NTR — the standard for assessing LIVE TRANSLATED subtitles.
 *
 * WER, CER and chrF++ all treat every error as equal. Live-subtitle practice in
 * Europe and the UK does not: the NER model (Romero-Fresco & Pöchhacker) and
 * its translated-subtitle variant NTR weight each error by how much MEANING it
 * destroys, on the grounds that a viewer is harmed by a reversed negation and
 * barely harmed by a dropped article. Broadcasters and regulators score live
 * subtitles this way, and vendors report in it — AI-Media publishes 98.7% NTR
 * rather than a WER.
 *
 *   score = (N − T − R) / N × 100
 *
 *   N  words in the subtitle output
 *   T  translation errors — meaning wrong, though correctly heard
 *   R  recognition errors — mis-heard speech
 *
 * Both weighted by severity: minor 0.25, standard 0.5, serious 1.0. The
 * accepted quality threshold is **98%**, which is far stricter than it sounds
 * precisely because trivial errors are discounted.
 *
 * Splitting T from R is what makes this worth the trouble here. Our four
 * architectures fail in different places — a pivot pipeline can only make
 * translation errors on top of whatever the ASR already got wrong, whereas a
 * single-model translator fuses both — and a metric that separates them says
 * *which stage* to fix. WER cannot.
 */
import { AzureOpenAI } from "openai";
import { getAnalysisModel } from "../../lib/providers/models";

const WINDOWS = 6;
const MIN_WINDOW_CHARS = 250;

function client(): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-03-01-preview",
  });
}

function slice(text: string, i: number, n: number): string {
  const len = text.length;
  return text.slice(Math.floor((i * len) / n), Math.floor(((i + 1) * len) / n));
}

const SYSTEM = `You are assessing LIVE TRANSLATED SUBTITLES against the official record of the same passage, using the NTR model used by broadcasters to certify live subtitle quality.

Count errors in the CANDIDATE relative to the REFERENCE, and classify each by how much meaning it destroys for a viewer:

- "serious"  (weight 1.00) — meaning reversed, invented, or a whole proposition lost; wrong number, wrong country, wrong speaker, negation flipped
- "standard" (weight 0.50) — meaning materially altered or a clause dropped, but the gist survives
- "minor"    (weight 0.25) — small omission or imprecision a viewer would barely notice

Also classify each error by its likely ORIGIN:
- "T" (translation) — the words were plainly heard right but rendered with wrong meaning
- "R" (recognition) — the speech was mis-heard: garbled names, nonsense words, wrong-language output

DO NOT count as errors: paraphrase that preserves meaning, condensation that preserves meaning, differences of register or word order, punctuation, or formatting. Live subtitles are expected to compress.

The two texts are approximately aligned proportional slices of a longer meeting, so a modest offset at the edges is expected and must NOT be counted.

Respond with ONLY JSON:
{"words": <word count of the CANDIDATE>, "T": {"minor": n, "standard": n, "serious": n}, "R": {"minor": n, "standard": n, "serious": n}}`;

export interface NTRResult {
  /** NTR score 0-100. Broadcast threshold is 98. */
  score: number;
  /** Points lost to translation errors. */
  translationLoss: number;
  /** Points lost to recognition errors. */
  recognitionLoss: number;
  windows: number;
}

const W = { minor: 0.25, standard: 0.5, serious: 1.0 };

export async function scoreNTR(
  reference: string,
  candidate: string,
  language: string,
): Promise<NTRResult | null> {
  if (!reference.trim() || !candidate.trim()) return null;
  const c = client();

  let totalWords = 0;
  let tLoss = 0;
  let rLoss = 0;
  let used = 0;

  for (let i = 0; i < WINDOWS; i++) {
    const ref = slice(reference, i, WINDOWS);
    const cand = slice(candidate, i, WINDOWS);
    if (ref.length < MIN_WINDOW_CHARS) continue;
    try {
      const res = await c.chat.completions.create({
        model: getAnalysisModel(),
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content:
              `Language: ${language}\n\n--- REFERENCE ---\n${ref}\n\n--- CANDIDATE ---\n${cand || "(empty)"}`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
        words?: number;
        T?: Record<string, number>;
        R?: Record<string, number>;
      };
      const words = p.words ?? cand.split(/\s+/).filter(Boolean).length;
      if (!words) continue;
      const wsum = (o?: Record<string, number>) =>
        (o?.minor ?? 0) * W.minor +
        (o?.standard ?? 0) * W.standard +
        (o?.serious ?? 0) * W.serious;
      totalWords += words;
      tLoss += wsum(p.T);
      rLoss += wsum(p.R);
      used++;
    } catch {
      continue;
    }
  }

  if (!used || !totalWords) return null;
  // Clamp at zero: a system that emits almost nothing can otherwise produce a
  // large negative that says nothing beyond "it failed", and coverage already
  // reports that far more legibly.
  const score = Math.max(
    0,
    ((totalWords - tLoss - rLoss) / totalWords) * 100,
  );
  return {
    score,
    translationLoss: (tLoss / totalWords) * 100,
    recognitionLoss: (rLoss / totalWords) * 100,
    windows: used,
  };
}
