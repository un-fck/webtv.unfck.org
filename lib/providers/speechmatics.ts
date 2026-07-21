import fs from "fs";
import path from "path";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp, apiLanguage } from "./utils";

const SPEECHMATICS_API_KEY = process.env.SPEECHMATICS_API_KEY!;
const BASE = "https://asr.api.speechmatics.com/v2";

/**
 * Speechmatics batch, one entry per model. The models are NOT interchangeable
 * and the split is deliberate — a single entry cannot describe both, because:
 *
 *   - `melia-1` REQUIRES `language: "multi"`. Single ISO codes (and `auto`) are
 *     rejected. "Melia for English" is not a configuration that exists.
 *   - The monolingual models (`standard` / `enhanced`, the Ursa 2 family) take a
 *     single ISO code and cannot do `multi`.
 *
 * Before this split, one entry named `speechmatics-melia-1` served both paths by
 * omitting `model` on single-language requests — which silently selected
 * `standard` (the API default) while still reporting `model: "melia-1"`, and so
 * billed at Melia's $0.129/hr instead of Standard's $0.24/hr. Keeping
 * `name`/`model` honest per entry is what prevents that class of bug.
 *
 * Accuracy per the vendor's own table: enhanced "Highest" > standard "High"
 * = melia "High". Melia is production preview and has no `additional_vocab`.
 */
function makeSpeechmatics(
  name: string,
  label: string,
  model: "melia-1" | "standard" | "enhanced",
): TranscriptionProvider {
  const isMelia = model === "melia-1";

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
      const lang = apiLanguage(opts?.language);

      // Fail loudly on a config the API cannot serve, rather than silently
      // being served by a different model than this entry advertises.
      if (isMelia && lang) {
        throw new Error(
          `${name} is multilingual-only (language: "multi") and cannot transcribe a ` +
            `single-language track ("${lang}"). Use speechmatics-standard or ` +
            `speechmatics-enhanced for monolingual audio.`,
        );
      }
      if (!isMelia && !lang) {
        throw new Error(
          `${name} (model: ${model}) is monolingual and cannot transcribe the ` +
            `multilingual floor track. Use speechmatics-melia-1 for floor audio.`,
        );
      }

      const ownedPath = !opts?.audioFilePath;
      const filePath =
        opts?.audioFilePath ||
        (await downloadAudioToTemp(audioUrl, "Speechmatics"));

      try {
        // `model` supersedes the deprecated `operating_point` (batch, 2026-07-01).
        // Omitting it defaults to `standard` — always send it explicitly.
        //
        // language_hints bias (not restrict) Melia's per-word language labels —
        // documented as most useful "where two languages sound similar", which
        // is exactly the ru/uk confusion the unhinted run showed on Russian
        // floor statements. The six UN languages are always known a priori.
        const transcription_config = isMelia
          ? {
              model,
              language: "multi",
              language_hints: ["en", "fr", "es", "ar", "cmn", "ru"],
              diarization: "speaker",
            }
          : { model, language: lang, diarization: "speaker" };

        const config = { type: "transcription", transcription_config };

        const form = new FormData();
        form.append("config", JSON.stringify(config));
        form.append(
          "data_file",
          new Blob([fs.readFileSync(filePath)], { type: "audio/mp4" }),
          path.basename(filePath),
        );

        const submitRes = await fetch(`${BASE}/jobs/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` },
          body: form,
        });
        if (!submitRes.ok)
          throw new Error(
            `Speechmatics submit failed ${submitRes.status}: ${await submitRes.text()}`,
          );
        const { id } = (await submitRes.json()) as { id: string };

        for (let i = 0; ; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const pollRes = await fetch(`${BASE}/jobs/${id}/`, {
            headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` },
          });
          const { job } = (await pollRes.json()) as {
            job: { status: string; errors?: unknown };
          };
          if (job.status === "done") break;
          if (job.status === "rejected" || job.status === "deleted")
            throw new Error(
              `Speechmatics job ${job.status}: ${JSON.stringify(job.errors ?? job)}`,
            );
          if (i % 6 === 5)
            console.log(`  [${name}] Still processing... (${(i + 1) * 5}s)`);
        }

        const trRes = await fetch(
          `${BASE}/jobs/${id}/transcript?format=json-v2`,
          { headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` } },
        );
        if (!trRes.ok)
          throw new Error(
            `Speechmatics transcript fetch failed ${trRes.status}: ${await trRes.text()}`,
          );
        const raw = (await trRes.json()) as {
          results: Array<{
            type: string; // "word" | "punctuation"
            start_time: number; // seconds
            end_time: number;
            attaches_to?: string;
            alternatives?: Array<{
              content: string;
              speaker?: string;
              language?: string;
              confidence?: number;
            }>;
          }>;
        };

        // Group consecutive word results by speaker into utterances;
        // punctuation attaches to the previous token without a space.
        const utterances: NormalizedTranscript["utterances"] = [];
        for (const r of raw.results) {
          const alt = r.alternatives?.[0];
          if (!alt) continue;
          if (r.type === "punctuation") {
            const last = utterances[utterances.length - 1];
            if (last) last.text += alt.content;
            continue;
          }
          const speaker = alt.speaker || "UU";
          const startMs = r.start_time * 1000;
          const endMs = r.end_time * 1000;
          const word = {
            text: alt.content,
            start: startMs,
            end: endMs,
            confidence: alt.confidence,
            speaker,
            // Melia labels every word with the language actually spoken. On the
            // floor track that is the only direct signal of a speaker's original
            // language, so carry it through instead of dropping it.
            language: alt.language,
          };
          const last = utterances[utterances.length - 1];
          if (last && last.speaker === speaker) {
            last.end = endMs;
            last.text += " " + alt.content;
            last.words!.push(word);
          } else {
            utterances.push({
              speaker,
              start: startMs,
              end: endMs,
              text: alt.content,
              words: [word],
            });
          }
        }

        const durationMs =
          utterances.length > 0 ? utterances[utterances.length - 1].end : 0;
        return {
          provider: name,
          language: opts?.language || "multi",
          fullText: utterances.map((u) => u.text).join("\n"),
          utterances,
          durationMs,
          usage: durationMs ? { audioSeconds: durationMs / 1000 } : undefined,
          raw,
        } satisfies NormalizedTranscript;
      } finally {
        if (ownedPath) {
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      }
    },
  };
}

/** Floor track (production since 2026-07-10). Multilingual only. */
export const speechmaticsMelia = makeSpeechmatics(
  "speechmatics-melia-1",
  "Speechmatics Melia 1",
  "melia-1",
);
/** Monolingual, API default tier. $0.24/hr. */
export const speechmaticsStandard = makeSpeechmatics(
  "speechmatics-standard",
  "Speechmatics Standard",
  "standard",
);
/** Monolingual, vendor's "highest accuracy" tier. $0.40/hr. */
export const speechmaticsEnhanced = makeSpeechmatics(
  "speechmatics-enhanced",
  "Speechmatics Enhanced",
  "enhanced",
);
