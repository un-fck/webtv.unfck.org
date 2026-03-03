#!/usr/bin/env tsx
/**
 * Collects eval results, ground truth texts, and transcriptions
 * into a single data.json file for the dashboard.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', '..', 'results');
const CORPUS_DIR = path.join(__dirname, '..', '..', 'corpus');
const OUT = path.join(__dirname, '..', 'public', 'data.json');

interface Result {
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

function main() {
  // Load summary results
  const summaryPath = path.join(RESULTS_DIR, 'summary.json');
  const results: Result[] = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

  // Load session metadata
  const evalSessionsPath = path.join(CORPUS_DIR, 'eval-sessions.json');
  const sessions: Array<{ symbol: string; assetId: string; notes?: string }> =
    JSON.parse(fs.readFileSync(evalSessionsPath, 'utf-8'));

  // Collect unique symbols from results
  const symbols = [...new Set(results.map(r => r.symbol))];

  // Collect ground truth texts
  const groundTruth: Record<string, Record<string, string>> = {};
  const gtDir = path.join(RESULTS_DIR, 'ground-truth');
  for (const symbol of symbols) {
    const safeSymbol = symbol.replace(/\//g, '_');
    const symDir = path.join(gtDir, safeSymbol);
    if (!fs.existsSync(symDir)) continue;
    groundTruth[symbol] = {};
    for (const file of fs.readdirSync(symDir)) {
      if (file.endsWith('.txt') && !file.includes('speakers')) {
        const lang = file.replace('.txt', '');
        const text = fs.readFileSync(path.join(symDir, file), 'utf-8');
        groundTruth[symbol][lang] = text;
      }
    }
  }

  // Collect transcriptions (from .txt files in raw/)
  const transcriptions: Record<string, Record<string, Record<string, string>>> = {};
  const rawDir = path.join(RESULTS_DIR, 'raw');
  for (const symbol of symbols) {
    const safeSymbol = symbol.replace(/\//g, '_');
    const symDir = path.join(rawDir, safeSymbol);
    if (!fs.existsSync(symDir)) continue;
    transcriptions[symbol] = {};
    for (const file of fs.readdirSync(symDir)) {
      if (!file.endsWith('.txt')) continue;
      const match = file.match(/^(.+?)_([a-z]{2})\.txt$/);
      if (!match) continue;
      const [, provider, lang] = match;
      if (!transcriptions[symbol][lang]) transcriptions[symbol][lang] = {};
      const text = fs.readFileSync(path.join(symDir, file), 'utf-8');
      // Extract just the text content (strip speaker labels for comparison)
      const plainText = text.replace(/^\[\d+\] Speaker \w+ \([^)]+\)\n/gm, '');
      transcriptions[symbol][lang][provider] = plainText;
    }
  }

  // Build session metadata map
  const sessionMeta: Record<string, { notes: string; assetId: string }> = {};
  for (const s of sessions) {
    sessionMeta[s.symbol] = { notes: s.notes || '', assetId: s.assetId || '' };
  }

  const data = {
    results,
    sessions: sessionMeta,
    groundTruth,
    transcriptions,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data));
  const sizeMB = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${OUT} (${sizeMB} MB)`);
  console.log(`  ${results.length} results, ${symbols.length} sessions, ${Object.keys(groundTruth).length} GT sessions`);
}

main();
