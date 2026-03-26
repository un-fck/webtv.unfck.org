#!/usr/bin/env tsx
/**
 * Discover short SC/GA meetings suitable for eval dev iteration.
 * Checks: audio languages available, PV document exists.
 */
import "../../lib/load-env";
import { getAvailableAudioLanguages } from "../../lib/transcription";
import { resolveEntryId } from "../../lib/kaltura-helpers";
import { pvDocumentExists } from "../ground-truth/documents-api";

// Scrape UN Web TV schedule for a specific date, looking for SC/GA meetings
async function scrapeDate(date: string) {
  const res = await fetch(`https://webtv.un.org/en/schedule/${date}`);
  if (!res.ok) return [];
  const html = await res.text();

  const results: Array<{
    assetId: string;
    title: string;
    category: string;
    duration: string;
    durationSeconds: number;
  }> = [];

  const videoPattern =
    /<h6[^>]*class="text-primary"[^>]*>([^<]+)<\/h6>[\s\S]*?<h4[^>]*>[\s\S]*?href="\/en\/asset\/([^"]+)"[^>]*>[\s\S]*?<div class="field__item">([^<]+)<\/div>/g;
  const durationPattern =
    /<span class="badge[^"]*">(\d{2}:\d{2}:\d{2})<\/span>/g;

  // Collect durations
  const durations: string[] = [];
  for (const m of html.matchAll(durationPattern)) {
    durations.push(m[1]);
  }

  let dIdx = 0;
  for (const match of html.matchAll(videoPattern)) {
    const [, category, assetId, title] = match;
    const cat = category.trim();
    const dur = durations[dIdx++] || "00:00:00";

    // Only SC or GA meetings
    if (!/security council|general assembly/i.test(cat)) continue;

    const [h, m, s] = dur.split(":").map(Number);
    const seconds = h * 3600 + m * 60 + s;

    results.push({
      assetId,
      title: title.trim(),
      category: cat,
      duration: dur,
      durationSeconds: seconds,
    });
  }

  return results;
}

function parseMeetingSymbol(title: string, category: string): string | null {
  // Security Council: "10103rd meeting" → S/PV.10103
  const scMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+meeting/);
  if (scMatch && /security council/i.test(category)) {
    return `S/PV.${scMatch[1]}`;
  }

  // General Assembly: "80th session, 7th plenary meeting" → A/80/PV.7
  const sessionMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+session/);
  const plenaryMatch = title.match(/(\d+)(?:st|nd|rd|th)\s+plenary\s+meeting/);
  if (sessionMatch && plenaryMatch && /general assembly/i.test(category)) {
    return `A/${sessionMatch[1]}/PV.${plenaryMatch[1]}`;
  }

  return null;
}

async function main() {
  console.log("Discovering short SC/GA sessions for eval dev set...\n");

  const candidates: Array<{
    symbol: string;
    assetId: string;
    title: string;
    duration: string;
    durationSeconds: number;
    category: string;
  }> = [];

  // Scan recent dates (go back further since PV records lag)
  const today = new Date();
  const daysBack = 90;

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    if (i % 10 === 0) console.log(`Scanning ${dateStr}...`);

    try {
      const videos = await scrapeDate(dateStr);

      for (const v of videos) {
        const symbol = parseMeetingSymbol(v.title, v.category);
        if (!symbol) continue;

        // Prefer short meetings (under 60 min)
        if (v.durationSeconds > 3600) continue;

        candidates.push({ ...v, symbol });
      }
    } catch (err) {
      // Skip failed dates
    }
  }

  // Sort by duration (shortest first)
  candidates.sort((a, b) => a.durationSeconds - b.durationSeconds);

  console.log(`\nFound ${candidates.length} SC/GA meetings under 60 min.\n`);

  // Check top candidates for PV documents + audio languages
  const verified: typeof candidates & { languages?: string[] }[] = [];

  for (const c of candidates.slice(0, 15)) {
    console.log(`Checking ${c.symbol} (${c.duration}, ${c.title})...`);

    // Check PV exists (English)
    const pvExists = await pvDocumentExists(c.symbol, "en");
    if (!pvExists) {
      console.log(`  PV document not found, skipping.`);
      continue;
    }

    // Resolve entry ID and check audio languages
    try {
      const entryId = await resolveEntryId(c.assetId);
      if (!entryId) {
        console.log(`  Could not resolve entry ID, skipping.`);
        continue;
      }

      const { languages } = await getAvailableAudioLanguages(entryId);
      const langNames = languages.map((l) => l.language);
      console.log(`  PV: yes | Audio langs: ${langNames.join(", ")}`);

      (c as any).languages = langNames;
      verified.push(c as any);

      if (verified.length >= 5) break;
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("RECOMMENDED DEV SESSIONS:");
  console.log("=".repeat(60));

  for (const v of verified.slice(0, 3)) {
    console.log(`\n  Symbol:   ${v.symbol}`);
    console.log(`  Asset ID: ${(v as any).assetId}`);
    console.log(`  Title:    ${(v as any).title}`);
    console.log(`  Duration: ${(v as any).duration}`);
    console.log(`  Langs:    ${(v as any).languages?.join(", ")}`);
  }

  // Output sessions.json content
  const sessions = verified.slice(0, 3).map((v) => ({
    symbol: v.symbol,
    assetId: (v as any).assetId,
    notes: `${(v as any).title} (${(v as any).duration})`,
  }));

  console.log("\n\nsessions.json content:");
  console.log(JSON.stringify(sessions, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
