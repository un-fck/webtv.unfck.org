/**
 * One-shot harvester: scrape the UNSD M49 "Standard Country or Area Codes"
 * overview page — which embeds the full table in all six official UN
 * languages as tab panes — and build an ISO alpha-3 → { en, fr, es, ar, zh,
 * ru } mapping of official UN country names.
 *
 * Source: https://unstats.un.org/unsd/methodology/m49/overview/
 * These are the UN's official short names ("Russian Federation", "Iran
 * (Islamic Republic of)", "Türkiye"), not CLDR common names — which is what
 * a UN transcripts site should display.
 *
 * Output: writes lib/data/country-names.json (sorted by alpha-3 code for
 * deterministic diffs).
 *
 * Run: tsx scripts/harvest-country-names.ts
 *
 * Not in package.json — intended to be run ad hoc when the M49 list changes
 * (a few name updates per year); not part of the production pipeline.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const M49_URL = "https://unstats.un.org/unsd/methodology/m49/overview/";
const OUTPUT_PATH = join(__dirname, "..", "lib", "data", "country-names.json");

// Tab-pane element id on the M49 page → our locale code.
const PANES: Array<[paneId: string, locale: string]> = [
  ["ENG_Overview", "en"],
  ["FRA_Overview", "fr"],
  ["ESP_Overview", "es"],
  ["ARB_Overview", "ar"],
  ["CHN_Overview", "zh"],
  ["RUS_Overview", "ru"],
];

// Fixed column layout of the M49 overview table.
const COL_COUNTRY_NAME = 8;
const COL_ISO_ALPHA3 = 11;

function decodeEntities(s: string): string {
  // Non-Latin names are emitted as numeric entities (e.g. Spanish á = &#225;).
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    );
}

function extractText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Slice the HTML of one tab pane out of the full page. */
function paneSlice(html: string, paneId: string): string {
  const start = html.indexOf(`id="${paneId}"`);
  if (start === -1) throw new Error(`pane ${paneId} not found`);
  // Panes are sibling divs; the next pane id (or end of document) bounds us.
  let end = html.length;
  for (const [otherId] of PANES) {
    if (otherId === paneId) continue;
    const idx = html.indexOf(`id="${otherId}"`, start + 1);
    if (idx > start && idx < end) end = idx;
  }
  return html.slice(start, end);
}

/** Parse one pane's table into alpha3 → localized name. */
function parsePane(paneHtml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rowMatch of paneHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (m) => extractText(m[1]),
    );
    if (cells.length <= COL_ISO_ALPHA3) continue;
    const alpha3 = cells[COL_ISO_ALPHA3];
    const name = cells[COL_COUNTRY_NAME];
    // Rows without an ISO code (e.g. Channel Islands) and header rows fall out here.
    if (!/^[A-Z]{3}$/.test(alpha3) || !name) continue;
    out.set(alpha3, name);
  }
  return out;
}

async function main() {
  console.error(`Fetching ${M49_URL} ...`);
  const res = await fetch(M49_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const html = await res.text();
  console.error(`  ${(html.length / 1024).toFixed(0)} KB`);

  // alpha3 → { locale → name }
  const result = new Map<string, Record<string, string>>();
  for (const [paneId, locale] of PANES) {
    const names = parsePane(paneSlice(html, paneId));
    console.error(`  ${locale}: ${names.size} countries`);
    for (const [alpha3, name] of names) {
      const entry = result.get(alpha3) ?? {};
      entry[locale] = name;
      result.set(alpha3, entry);
    }
  }

  // Sanity: every entry should have all six languages.
  const locales = PANES.map(([, l]) => l);
  let incomplete = 0;
  for (const [alpha3, entry] of result) {
    const missing = locales.filter((l) => !entry[l]);
    if (missing.length > 0) {
      incomplete++;
      console.error(`  ! ${alpha3} missing: ${missing.join(",")}`);
    }
  }
  if (result.size < 190) {
    throw new Error(
      `only ${result.size} countries parsed — page layout likely changed`,
    );
  }

  // Sorted by alpha3, locales in a fixed order, for deterministic diffs.
  const sorted = Object.fromEntries(
    [...result.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([alpha3, entry]) => [
        alpha3,
        Object.fromEntries(
          locales.map((l) => [l, entry[l]]).filter(([, v]) => v),
        ),
      ]),
  );

  writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + "\n");
  console.error(
    `\nWrote ${result.size} countries (${incomplete} incomplete) to ${OUTPUT_PATH}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
