#!/usr/bin/env tsx
import "../lib/load-env";
import fs from "fs";
import path from "path";
import {
  getKalturaAudioUrl,
  getAvailableAudioLanguages,
} from "../lib/transcription";
import { resolveEntryId } from "../lib/kaltura-helpers";
import { fetchPVDocument } from "./ground-truth/documents-api";
import { parsePVDocument } from "./ground-truth/pdf-parser";
import { computeMetrics, computePairwiseMetrics } from "./metrics";
import {
  getProvider,
  getAllProviders,
  getProviderNames,
} from "./providers/registry";
import { UN_LANGUAGES } from "./config";
import { downloadAudioToTemp, formatTime as msToHMS } from "./utils";

interface SessionConfig {
  symbol: string;
  assetId: string;
  languages?: string[];
  notes?: string;
}

interface SessionResult {
  symbol: string;
  assetId: string;
  language: string;
  provider: string;
  wer: number;
  normalizedWer: number;
  cer: number;
  normalizedCer: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  refLength: number;
  hypLength: number;
  durationMs: number;
  timestamp: string;
}

const RESULTS_DIR = path.join(__dirname, "results");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    symbol?: string;
    corpus?: string;
    providers?: string[];
    languages?: string[];
  } = {};

  for (const arg of args) {
    if (arg.startsWith("--symbol="))
      opts.symbol = arg.slice("--symbol=".length);
    if (arg.startsWith("--corpus="))
      opts.corpus = arg.slice("--corpus=".length);
    if (arg.startsWith("--providers="))
      opts.providers = arg.slice("--providers=".length).split(",");
    if (arg.startsWith("--languages="))
      opts.languages = arg.slice("--languages=".length).split(",");
  }
  return opts;
}

async function evalSession(
  session: SessionConfig,
  providerNames: string[],
  languageFilter?: string[],
  skipKeys?: Set<string>,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Session: ${session.symbol} (asset: ${session.assetId})`);
  console.log("=".repeat(60));

  // Resolve entry ID
  const entryId = await resolveEntryId(session.assetId);
  if (!entryId) {
    console.error(`  Could not resolve entry ID for ${session.assetId}`);
    return [];
  }

  // Discover available audio languages
  let availableLangs: { language: string; flavorParamId: number }[] = [];
  try {
    const result = await getAvailableAudioLanguages(entryId);
    availableLangs = result.languages;
  } catch (err) {
    console.error(
      `  Failed to query audio languages: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
  const availableLangNames = availableLangs.map((l) => l.language);
  console.log(`  Available audio languages: ${availableLangNames.join(", ")}`);

  // Determine which languages to evaluate
  const targetLangs = (
    languageFilter ||
    session.languages ||
    Object.keys(UN_LANGUAGES)
  ).filter((lang) => {
    // Map ISO codes to full language names for Kaltura lookup
    const fullName = UN_LANGUAGES[lang] || lang;
    return availableLangNames.includes(fullName);
  });

  if (targetLangs.length === 0) {
    console.log("  No matching audio languages found, skipping.");
    return [];
  }

  const results: SessionResult[] = [];

  for (const lang of targetLangs) {
    const fullLangName = UN_LANGUAGES[lang] || lang;
    console.log(`\n  Language: ${lang} (${fullLangName})`);

    // Get audio URL for this language
    const { audioUrl } = await getKalturaAudioUrl(entryId, fullLangName);
    console.log(`  Audio URL: ${audioUrl}`);

    // Fetch and parse ground truth PV document
    let groundTruthText: string | null = null;
    const gtDir = path.join(
      RESULTS_DIR,
      "ground-truth",
      session.symbol.replace(/\//g, "_"),
    );
    const gtTextPath = path.join(gtDir, `${lang}.txt`);

    if (fs.existsSync(gtTextPath)) {
      // Use cached ground truth text
      groundTruthText = fs.readFileSync(gtTextPath, "utf-8");
      console.log(`  Ground truth: ${groundTruthText.length} chars (cached)`);
    } else {
      try {
        const pdfBuffer = await fetchPVDocument(session.symbol, lang);
        const parsed = await parsePVDocument(pdfBuffer);
        groundTruthText = parsed.fullText;
        // Save for inspection and caching
        fs.mkdirSync(gtDir, { recursive: true });
        fs.writeFileSync(gtTextPath, groundTruthText);
        if (parsed.speakers.length > 0) {
          const speakersText = parsed.speakers
            .map(
              (s) =>
                `## ${s.name}${s.affiliation ? ` (${s.affiliation})` : ""}\n${s.text.trim()}`,
            )
            .join("\n\n");
          fs.writeFileSync(
            path.join(gtDir, `${lang}_speakers.txt`),
            speakersText,
          );
        }
        console.log(
          `  Ground truth: ${groundTruthText.length} chars, ${parsed.speakers.length} speakers → ${gtTextPath}`,
        );
      } catch (err) {
        console.warn(
          `  Ground truth unavailable: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Download audio once, share across providers (cache in corpus-data/audio/)
    const audioCacheDir = path.join(__dirname, "corpus-data", "audio");
    const audioCachePath = path.join(
      audioCacheDir,
      `${session.symbol.replace(/\//g, "_")}_${lang}.m4a`,
    );
    let audioFilePath: string | null = null;
    if (fs.existsSync(audioCachePath)) {
      audioFilePath = audioCachePath;
      console.log(`  Audio: cached (${(fs.statSync(audioCachePath).size / 1024 / 1024).toFixed(0)}MB)`);
    } else {
      try {
        const tmpPath = await downloadAudioToTemp(audioUrl);
        fs.mkdirSync(audioCacheDir, { recursive: true });
        fs.copyFileSync(tmpPath, audioCachePath);
        fs.unlinkSync(tmpPath);
        audioFilePath = audioCachePath;
      } catch (err) {
        console.error(
          `  Audio download failed: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
    }

    // Run each provider
    const providerOutputs: Record<string, string> = {};
    const rawDir = path.join(
      RESULTS_DIR,
      "raw",
      session.symbol.replace(/\//g, "_"),
    );
    fs.mkdirSync(rawDir, { recursive: true });

    for (const providerName of providerNames) {
      const rawFilePath = path.join(rawDir, `${providerName}_${lang}.json`);

      // Resume: load from cache if already computed
      if (fs.existsSync(rawFilePath)) {
        const summaryKey = `${session.symbol}|${lang}|${providerName}`;
        if (skipKeys?.has(summaryKey)) {
          console.log(`  ${providerName}: cached (metrics already in summary)`);
          try {
            const transcript = JSON.parse(
              fs.readFileSync(rawFilePath, "utf-8"),
            ) as import("./providers/types").NormalizedTranscript;
            providerOutputs[providerName] = transcript.fullText;
          } catch {}
          continue;
        }
        console.log(`  ${providerName}: cached (recomputing metrics)`);
        try {
          const transcript = JSON.parse(
            fs.readFileSync(rawFilePath, "utf-8"),
          ) as import("./providers/types").NormalizedTranscript;
          providerOutputs[providerName] = transcript.fullText;
          if (groundTruthText) {
            const metrics = computeMetrics(
              groundTruthText,
              transcript.fullText,
              lang,
            );
            results.push({
              symbol: session.symbol,
              assetId: session.assetId,
              language: lang,
              provider: providerName,
              wer: metrics.wer.wer,
              normalizedWer: metrics.normalizedWer.wer,
              cer: metrics.wer.cer,
              normalizedCer: metrics.normalizedWer.cer,
              substitutions: metrics.normalizedWer.substitutions,
              insertions: metrics.normalizedWer.insertions,
              deletions: metrics.normalizedWer.deletions,
              refLength: metrics.normalizedWer.refLength,
              hypLength: metrics.normalizedWer.hypLength,
              durationMs: transcript.durationMs,
              timestamp: new Date().toISOString(),
            });
            const r = results[results.length - 1];
            console.log(
              `    WER: ${(r.wer * 100).toFixed(1)}% | Normalized WER: ${(r.normalizedWer * 100).toFixed(1)}% | CER: ${(r.cer * 100).toFixed(1)}%`,
            );
          }
        } catch (err) {
          console.warn(
            `    Cache load failed, will re-run: ${err instanceof Error ? err.message : err}`,
          );
          fs.unlinkSync(rawFilePath); // delete corrupt cache
        }
        continue;
      }

      console.log(`  Running ${providerName}...`);
      const provider = getProvider(providerName);

      try {
        const transcript = await provider.transcribe(audioUrl, {
          audioFilePath,
          language: lang,
        });

        providerOutputs[providerName] = transcript.fullText;

        // Save raw transcript JSON + plain text for inspection
        fs.writeFileSync(rawFilePath, JSON.stringify(transcript, null, 2));
        fs.writeFileSync(
          path.join(rawDir, `${providerName}_${lang}.txt`),
          transcript.utterances.length > 0
            ? transcript.utterances
                .map(
                  (u, i) =>
                    `[${i + 1}] Speaker ${u.speaker} (${msToHMS(u.start)} - ${msToHMS(u.end)})\n${u.text}\n`,
                )
                .join("\n")
            : transcript.fullText,
        );

        // Compute WER against ground truth if available
        if (groundTruthText) {
          const metrics = computeMetrics(
            groundTruthText,
            transcript.fullText,
            lang,
          );

          const result: SessionResult = {
            symbol: session.symbol,
            assetId: session.assetId,
            language: lang,
            provider: providerName,
            wer: metrics.wer.wer,
            normalizedWer: metrics.normalizedWer.wer,
            cer: metrics.wer.cer,
            normalizedCer: metrics.normalizedWer.cer,
            substitutions: metrics.normalizedWer.substitutions,
            insertions: metrics.normalizedWer.insertions,
            deletions: metrics.normalizedWer.deletions,
            refLength: metrics.normalizedWer.refLength,
            hypLength: metrics.normalizedWer.hypLength,
            durationMs: transcript.durationMs,
            timestamp: new Date().toISOString(),
          };

          results.push(result);
          console.log(
            `    WER: ${(result.wer * 100).toFixed(1)}% | Normalized WER: ${(result.normalizedWer * 100).toFixed(1)}% | CER: ${(result.cer * 100).toFixed(1)}%`,
          );
        } else {
          console.log(
            `    Transcription complete (${transcript.fullText.length} chars), no ground truth to compare`,
          );
        }
      } catch (err) {
        console.error(
          `    ${providerName} failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Pairwise WER between providers
    const providerPairs = Object.keys(providerOutputs);
    if (providerPairs.length >= 2) {
      console.log("\n  Pairwise provider comparison:");
      for (let i = 0; i < providerPairs.length; i++) {
        for (let j = i + 1; j < providerPairs.length; j++) {
          const pairMetrics = computePairwiseMetrics(
            providerOutputs[providerPairs[i]],
            providerOutputs[providerPairs[j]],
            lang,
          );
          console.log(
            `    ${providerPairs[i]} vs ${providerPairs[j]}: WER ${(pairMetrics.normalizedWer.wer * 100).toFixed(1)}%`,
          );
        }
      }
    }

    // Audio files are cached in corpus-data/audio/, don't delete
  }

  return results;
}

async function main() {
  const opts = parseArgs();

  // Load sessions (--corpus overrides default sessions.json)
  const sessionsPath = opts.corpus
    ? path.resolve(opts.corpus)
    : path.join(__dirname, "corpus", "sessions.json");
  if (!fs.existsSync(sessionsPath)) {
    console.error(`Sessions file not found: ${sessionsPath}`);
    console.error("Create eval/corpus/sessions.json with your test sessions.");
    process.exit(1);
  }

  const sessions: SessionConfig[] = JSON.parse(
    fs.readFileSync(sessionsPath, "utf-8"),
  );
  const filteredSessions = opts.symbol
    ? sessions.filter((s) => s.symbol === opts.symbol)
    : sessions;

  if (filteredSessions.length === 0) {
    console.error(
      `No sessions found${opts.symbol ? ` matching ${opts.symbol}` : ""}`,
    );
    process.exit(1);
  }

  const providerNames = opts.providers || getProviderNames();
  console.log(`Providers: ${providerNames.join(", ")}`);
  console.log(`Sessions: ${filteredSessions.length}`);
  console.log(`Languages: ${opts.languages?.join(", ") || "all available"}`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  // Load existing results to merge with (supports resumable runs)
  const summaryPath = path.join(RESULTS_DIR, "summary.json");
  const existingResults: SessionResult[] = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, "utf-8"))
    : [];
  // Index by symbol+language+provider to avoid duplicates
  const existingKey = (r: SessionResult) =>
    `${r.symbol}|${r.language}|${r.provider}`;
  const existingKeys = new Set(existingResults.map(existingKey));

  const allResults: SessionResult[] = [...existingResults];

  for (const session of filteredSessions) {
    const results = await evalSession(session, providerNames, opts.languages, existingKeys);
    // Merge new results, deduplicating by symbol+language+provider
    for (const r of results) {
      if (!existingKeys.has(existingKey(r))) {
        allResults.push(r);
        existingKeys.add(existingKey(r));
      }
    }
  }

  // Write merged summary
  fs.writeFileSync(summaryPath, JSON.stringify(allResults, null, 2));
  console.log(`\nResults written to ${summaryPath}`);

  // Print summary table
  if (allResults.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(
      "Provider".padEnd(20) +
        "Lang".padEnd(6) +
        "WER".padEnd(10) +
        "Norm WER".padEnd(10) +
        "CER".padEnd(10) +
        "Symbol",
    );
    console.log("-".repeat(80));
    for (const r of allResults) {
      console.log(
        r.provider.padEnd(20) +
          r.language.padEnd(6) +
          `${(r.wer * 100).toFixed(1)}%`.padEnd(10) +
          `${(r.normalizedWer * 100).toFixed(1)}%`.padEnd(10) +
          `${(r.cer * 100).toFixed(1)}%`.padEnd(10) +
          r.symbol,
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
