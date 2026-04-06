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
    cachedOnly?: boolean;
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
    if (arg === "--cached-only") opts.cachedOnly = true;
  }
  return opts;
}

async function evalSession(
  session: SessionConfig,
  providerNames: string[],
  languageFilter?: string[],
  skipKeys?: Set<string>,
  cachedOnly?: boolean,
) {
  const tSession = Date.now();
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

    // Run providers in parallel
    const providerOutputs: Record<string, string> = {};
    const rawDir = path.join(
      RESULTS_DIR,
      "raw",
      session.symbol.replace(/\//g, "_"),
    );
    fs.mkdirSync(rawDir, { recursive: true });

    const tLang = Date.now();

    // Build tasks for each provider
    const runProvider = async (providerName: string) => {
      const rawFilePath = path.join(rawDir, `${providerName}_${lang}.json`);

      // Resume: load from cache if already computed
      if (fs.existsSync(rawFilePath)) {
        const summaryKey = `${session.symbol}|${lang}|${providerName}`;
        if (skipKeys?.has(summaryKey)) {
          console.log(`  ${providerName}: cached`);
          try {
            const transcript = JSON.parse(
              fs.readFileSync(rawFilePath, "utf-8"),
            ) as import("./providers/types").NormalizedTranscript;
            providerOutputs[providerName] = transcript.fullText;
          } catch {}
          return null;
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
            const r: SessionResult = {
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
            console.log(
              `    ${providerName}: WER ${(r.wer * 100).toFixed(1)}% | Norm ${(r.normalizedWer * 100).toFixed(1)}%`,
            );
            return r;
          }
        } catch (err) {
          console.warn(
            `    ${providerName}: cache load failed, re-running`,
          );
          fs.unlinkSync(rawFilePath);
        }
        return null;
      }

      if (cachedOnly) {
        console.log(`  ${providerName}: skipped (no cache, --cached-only)`);
        return null;
      }

      const provider = getProvider(providerName);
      const tProvider = Date.now();

      try {
        const transcript = await provider.transcribe(audioUrl, {
          audioFilePath,
          language: lang,
        });
        const elapsed = ((Date.now() - tProvider) / 1000).toFixed(1);

        providerOutputs[providerName] = transcript.fullText;

        // Save raw transcript JSON + plain text
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

        if (groundTruthText) {
          const metrics = computeMetrics(
            groundTruthText,
            transcript.fullText,
            lang,
          );
          const r: SessionResult = {
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
          console.log(
            `    ${providerName}: ${elapsed}s → WER ${(r.wer * 100).toFixed(1)}% | Norm ${(r.normalizedWer * 100).toFixed(1)}%`,
          );
          return r;
        } else {
          console.log(
            `    ${providerName}: ${elapsed}s → ${transcript.fullText.length} chars (no ground truth)`,
          );
        }
      } catch (err) {
        console.error(
          `    ${providerName}: FAILED (${((Date.now() - tProvider) / 1000).toFixed(1)}s) ${err instanceof Error ? err.message : err}`,
        );
      }
      return null;
    };

    // Run all providers in parallel
    const providerResults = await Promise.all(providerNames.map(runProvider));
    for (const r of providerResults) {
      if (r) results.push(r);
    }

    console.log(`  ${lang} done in ${((Date.now() - tLang) / 1000).toFixed(1)}s`);

    // Audio files are cached in corpus-data/audio/, don't delete
  }

  console.log(`\n  Session ${session.symbol} done in ${((Date.now() - tSession) / 1000).toFixed(1)}s`);
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

  const tMain = Date.now();
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
    const results = await evalSession(session, providerNames, opts.languages, existingKeys, opts.cachedOnly);
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
  const totalSec = ((Date.now() - tMain) / 1000).toFixed(1);
  console.log(`\nDone in ${totalSec}s. Results written to ${summaryPath}`);

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
