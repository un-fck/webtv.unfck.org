#!/usr/bin/env tsx
/**
 * Build the GA General Debate corpus (split 1).
 *
 * For each speech on gadebate.un.org (sessions 70–80, 2015–2025):
 *   - Extracts ISO country code + original language from page HTML
 *   - Downloads 7 audio tracks from UN Radio S3 CDN (FL + EN/FR/ES/AR/ZH/RU)
 *   - Downloads original-language statement PDF (where available)
 *
 * Output: eval/corpus-data/gadebate/
 *   audio/{session}_{CC}_{LANG}.mp3
 *   pdfs/{session}_{CC}_orig.pdf
 *   metadata.jsonl
 *
 * Usage:
 *   tsx eval/hf/build-gadebate.ts
 *   tsx eval/hf/build-gadebate.ts --sessions=79,80
 *   tsx eval/hf/build-gadebate.ts --dry-run   (metadata only, no downloads)
 */
import "../../lib/load-env";
import fs from "fs";
import path from "path";

const GADEBATE_BASE = "https://gadebate.un.org";
const S3_BASE =
  "https://s3.amazonaws.com/downloads.unmultimedia.org/radio/library/ltd/mp3/ga";
const CORPUS_DIR = path.join(__dirname, "..", "corpus-data", "gadebate");
const AUDIO_DIR = path.join(CORPUS_DIR, "audio");
const PDF_DIR = path.join(CORPUS_DIR, "pdfs");

const DRY_RUN = process.argv.includes("--dry-run");
const SESSIONS_ARG = process.argv.find((a) => a.startsWith("--sessions="));
const TARGET_SESSIONS: number[] | null = SESSIONS_ARG
  ? SESSIONS_ARG.replace("--sessions=", "").split(",").map(Number)
  : null;

// Sessions with confirmed audio on S3 (session 70 = 2015, goes to ~80 = 2025)
// 74 = 2019/2020 missing (COVID virtual session had no UN Radio audio)
// 75 had only 2 speeches on gadebate so skip
const AUDIO_SESSIONS = [70, 71, 72, 73, 76, 77, 78, 79, 80];

// GA session N → calendar year of general debate (September of year N + 1945)
const SESSION_YEAR: Record<number, number> = {
  70: 2015,
  71: 2016,
  72: 2017,
  73: 2018,
  76: 2021,
  77: 2022,
  78: 2023,
  79: 2024,
  80: 2025,
};

const UN_LANG_CODES = ["FL", "EN", "FR", "ES", "AR", "ZH", "RU"] as const;

export interface SpeechEntry {
  session: number;
  year: number;
  slug: string;
  country_iso: string;
  country_name: string;
  original_lang: string | null; // ISO 639-1, e.g. "pt"
  speech_date: string | null; // e.g. "2024-09-24"
  // Local file paths (relative to CORPUS_DIR)
  floor_file: string | null;
  en_file: string | null;
  fr_file: string | null;
  es_file: string | null;
  ar_file: string | null;
  zh_file: string | null;
  ru_file: string | null;
  orig_pdf_file: string | null;
}

/** Fetch gadebate.un.org/en/{session}/{slug} and extract all structured data. */
async function fetchSpeechEntry(
  session: number,
  slug: string,
): Promise<SpeechEntry | null> {
  const url = `${GADEBATE_BASE}/en/${session}/${slug}`;
  let html: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const year = SESSION_YEAR[session];

  // Extract S3 audio URLs and ISO country code from embedded URLs
  const s3Re = new RegExp(
    String.raw`https://s3\.amazonaws\.com/downloads\.unmultimedia\.org/radio/library/ltd/mp3/ga/${year}/${session}_([A-Z]{2,3})_(FL|EN|FR|ES|AR|ZH|RU)\.mp3`,
    "g",
  );
  const audioFiles: Partial<
    Record<"FL" | "EN" | "FR" | "ES" | "AR" | "ZH" | "RU", string>
  > = {};
  let countryIso = "";
  for (const m of html.matchAll(s3Re)) {
    const [, iso, lang] = m;
    audioFiles[lang as keyof typeof audioFiles] = m[0];
    countryIso = iso;
  }

  if (!countryIso) return null;

  // Extract original-language PDF path: "gastatements/79/br_pt.pdf"
  const pdfMatch = html.match(
    /gastatements\/(\d+)\/([a-z]{2,3})_([a-z]{2,3})\.pdf/,
  );
  const origLang = pdfMatch ? pdfMatch[3] : null; // language code, e.g. "pt"
  const origPdfUrl = pdfMatch
    ? `${GADEBATE_BASE}/sites/default/files/gastatements/${pdfMatch[1]}/${pdfMatch[2]}_${pdfMatch[3]}.pdf`
    : null;

  // Extract speech date (for PV session mapping)
  const dateMatch = html.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/,
  );
  let speechDate: string | null = null;
  if (dateMatch) {
    const months: Record<string, string> = {
      January: "01",
      February: "02",
      March: "03",
      April: "04",
      May: "05",
      June: "06",
      July: "07",
      August: "08",
      September: "09",
      October: "10",
      November: "11",
      December: "12",
    };
    speechDate = `${dateMatch[3]}-${months[dateMatch[2]]}-${dateMatch[1].padStart(2, "0")}`;
  }

  // Country display name from page <title>
  const titleMatch = html.match(/<title>([^|<]+)/);
  const countryName = titleMatch ? titleMatch[1].trim() : slug;

  const prefix = `${session}_${countryIso}`;

  return {
    session,
    year,
    slug,
    country_iso: countryIso,
    country_name: countryName,
    original_lang: origLang,
    speech_date: speechDate,
    floor_file: audioFiles["FL"] ? `audio/${prefix}_FL.mp3` : null,
    en_file: audioFiles["EN"] ? `audio/${prefix}_EN.mp3` : null,
    fr_file: audioFiles["FR"] ? `audio/${prefix}_FR.mp3` : null,
    es_file: audioFiles["ES"] ? `audio/${prefix}_ES.mp3` : null,
    ar_file: audioFiles["AR"] ? `audio/${prefix}_AR.mp3` : null,
    zh_file: audioFiles["ZH"] ? `audio/${prefix}_ZH.mp3` : null,
    ru_file: audioFiles["RU"] ? `audio/${prefix}_RU.mp3` : null,
    orig_pdf_file: origPdfUrl ? `pdfs/${prefix}_orig.pdf` : null,
    _s3Urls: audioFiles,
    _origPdfUrl: origPdfUrl,
  } as any;
}

/** Download with caching. Returns true if file is available. */
async function downloadCached(url: string, destPath: string): Promise<boolean> {
  if (fs.existsSync(destPath)) return true;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    return false;
  }
}

/** Get all speech slugs for a session from the sitemap (all pages). */
async function getSessionSlugs(session: number): Promise<string[]> {
  const slugs = new Set<string>();
  const pattern = new RegExp(`/en/${session}/([a-z][a-z0-9-]+)`, "g");
  // Always scan all pages — different sessions appear on different pages
  for (let page = 1; page <= 5; page++) {
    const url = `${GADEBATE_BASE}/sitemap.xml?page=${page}`;
    const res = await fetch(url);
    const xml = await res.text();
    if (!xml.includes("<loc>")) break; // empty page
    for (const m of xml.matchAll(pattern)) {
      slugs.add(m[1]);
    }
  }
  return [...slugs];
}

async function processSession(gaSession: number): Promise<SpeechEntry[]> {
  const year = SESSION_YEAR[gaSession];
  console.log(`\n=== Session ${gaSession} (${year}) ===`);

  const slugs = await getSessionSlugs(gaSession);
  console.log(`  ${slugs.length} speeches in sitemap`);

  // Fetch speech metadata in parallel batches
  const entries: SpeechEntry[] = [];
  for (let i = 0; i < slugs.length; i += 20) {
    const batch = slugs.slice(i, i + 20);
    const results = await Promise.all(
      batch.map((slug) => fetchSpeechEntry(gaSession, slug)),
    );
    for (const r of results) {
      if (r) entries.push(r);
    }
    process.stdout.write(
      `\r  metadata: ${entries.length}/${Math.min(i + 20, slugs.length)}`,
    );
  }
  console.log(`\r  ${entries.length} speeches with audio`);

  if (DRY_RUN) return entries;

  // Download audio + PDFs
  let downloaded = 0;
  let cached = 0;
  for (const entry of entries) {
    const e = entry as any;
    // Audio tracks
    for (const lang of UN_LANG_CODES) {
      const fileKey =
        lang === "FL" ? "floor_file" : `${lang.toLowerCase()}_file`;
      const audioUrl = e._s3Urls?.[lang];
      if (!audioUrl) continue;
      const destPath = path.join(CORPUS_DIR, (entry as any)[fileKey]);
      const wasCached = fs.existsSync(destPath);
      await downloadCached(audioUrl, destPath);
      wasCached ? cached++ : downloaded++;
    }
    // Original-lang PDF
    if (e._origPdfUrl && entry.orig_pdf_file) {
      const destPath = path.join(CORPUS_DIR, entry.orig_pdf_file);
      await downloadCached(e._origPdfUrl, destPath);
    }
    process.stdout.write(
      `\r  audio: ${downloaded} downloaded, ${cached} cached`,
    );
  }
  console.log();

  return entries;
}

async function main() {
  const sessions = TARGET_SESSIONS
    ? AUDIO_SESSIONS.filter((s) => TARGET_SESSIONS.includes(s))
    : AUDIO_SESSIONS;

  console.log(`GA General Debate corpus builder`);
  console.log(`Sessions: ${sessions.join(", ")}`);
  if (DRY_RUN) console.log("DRY RUN — metadata only, no downloads");

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });

  const allEntries: SpeechEntry[] = [];

  for (const session of sessions) {
    const entries = await processSession(session);
    // Strip internal _s3Urls/_origPdfUrl before writing
    const clean = entries.map((e) => {
      const { _s3Urls, _origPdfUrl, ...rest } = e as any;
      return rest as SpeechEntry;
    });
    allEntries.push(...clean);

    // Write metadata after each session (incremental)
    const metaPath = path.join(CORPUS_DIR, "metadata.jsonl");
    fs.writeFileSync(
      metaPath,
      allEntries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    console.log(
      `  Checkpoint: ${allEntries.length} total rows → metadata.jsonl`,
    );
  }

  console.log(`\nDone. ${allEntries.length} speeches in ${CORPUS_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
