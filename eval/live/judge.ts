/**
 * Semantic adequacy judging.
 *
 * WER and chrF++ both measure surface overlap with the verbatim record. That
 * systematically punishes the thing simultaneous interpreters are trained to
 * do: compress, reorder, and paraphrase while preserving meaning. An
 * interpreter who renders "the Council calls upon all parties to immediately
 * cease hostilities" as "le Conseil demande la cessation immédiate des
 * hostilités" has done the job perfectly and scores badly.
 *
 * So a third metric asks the question the surface metrics cannot: **how much
 * of what the speaker actually said survives?** Scored 0–100 for content
 * preservation, explicitly instructing the judge to ignore wording, style and
 * fluency differences and to penalise only missing, added, or altered
 * substance.
 *
 * Reference and hypothesis are compared in aligned windows rather than whole.
 * Both texts cover the same meeting end to end, so cutting each into the same
 * number of sequential proportional slices lines them up well enough for a
 * per-window judgement, and it keeps each call small enough to be reliable.
 */
import { AzureOpenAI } from "openai";
import { getAnalysisModelMini } from "../../lib/providers/models";

/** Windows per (system, cell). More windows = finer signal, linear cost. */
const WINDOWS = 8;
/** Skip windows shorter than this; slivers produce noisy scores. */
const MIN_WINDOW_CHARS = 200;

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

const SYSTEM = `You compare a candidate rendering of a United Nations meeting against the official verbatim record of the same passage.

Score CONTENT PRESERVATION from 0 to 100:
- 100 = every substantive point in the reference is present and correct
- 50  = roughly half the substance survives, or significant distortion
- 0   = unrelated, empty, or wholly wrong

IGNORE COMPLETELY: differences in wording, word order, register, style, fluency, punctuation, and formatting. Paraphrase is NOT an error. Condensation that keeps the substance is NOT an error.
PENALISE ONLY: omitted substance, invented substance, reversed or altered meaning, wrong numbers, wrong names, wrong attributions.

The two texts are aligned only approximately — they are proportional slices of a longer meeting — so a modest offset at the edges is expected and must NOT be penalised.

Respond with ONLY a JSON object: {"score": <integer 0-100>}`;

export interface AdequacyResult {
  meanScore: number;
  windows: number;
}

export async function judgeAdequacy(
  reference: string,
  hypothesis: string,
  language: string,
): Promise<AdequacyResult | null> {
  if (!reference.trim() || !hypothesis.trim()) return null;
  const c = client();
  const scores: number[] = [];

  for (let i = 0; i < WINDOWS; i++) {
    const ref = slice(reference, i, WINDOWS);
    const hyp = slice(hypothesis, i, WINDOWS);
    if (ref.length < MIN_WINDOW_CHARS) continue;

    try {
      const res = await c.chat.completions.create({
        model: getAnalysisModelMini(),
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content:
              `Language: ${language}\n\n` +
              `--- REFERENCE (official verbatim record) ---\n${ref}\n\n` +
              `--- CANDIDATE ---\n${hyp || "(empty)"}`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const raw = res.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { score?: number };
      if (typeof parsed.score === "number")
        scores.push(Math.max(0, Math.min(100, parsed.score)));
    } catch {
      // A judge failure on one window must not void the whole cell.
      continue;
    }
  }

  if (!scores.length) return null;
  return {
    meanScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    windows: scores.length,
  };
}
