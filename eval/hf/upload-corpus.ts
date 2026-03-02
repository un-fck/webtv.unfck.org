#!/usr/bin/env tsx
/**
 * Prepares and uploads the transcription corpus to united-nations/transcription-corpus.
 *
 * Dataset structure: one row per session
 *   data/{symbol_safe}_floor.mp3      — floor (original) audio
 *   data/{symbol_safe}_{lang}.mp3     — interpreted audio per language
 *   metadata.jsonl                    — one row per session
 *   README.md                         — dataset card
 *
 * Usage:
 *   npm run hf:upload-corpus
 *   npm run hf:upload-corpus -- --dry-run
 */
import '../../lib/load-env';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { uploadFiles, createRepo } from '@huggingface/hub';
import { getAvailableAudioLanguages } from '../../lib/transcription';
import { resolveEntryId } from '../../lib/kaltura-helpers';
import { fetchPVDocument } from '../ground-truth/documents-api';
import { parsePVDocument } from '../ground-truth/pdf-parser';
import { UN_LANGUAGES, DOC_LANG_CODES } from '../config';

const HF_TOKEN = process.env.HF_TOKEN!;
const HF_REPO = 'united-nations/transcription-corpus';
const CORPUS_DIR = path.join(__dirname, '..', 'corpus-data');
const AUDIO_DIR = path.join(CORPUS_DIR, 'audio');
const PDF_DIR = path.join(CORPUS_DIR, 'pdfs');
const GT_CACHE_DIR = path.join(__dirname, '..', 'results', 'ground-truth');

const DRY_RUN = process.argv.includes('--dry-run');
const SYMBOL_FILTER = process.argv.find(a => a.startsWith('--symbol='))?.replace('--symbol=', '');

interface SessionConfig {
  symbol: string;
  assetId: string;
  notes?: string;
}

interface CorpusEntry {
  symbol: string;
  webtv_url: string;
  duration_ms: number;
  num_speakers: number;
  // AudioFolder *_file_name columns → HF creates audio columns named floor/en/fr/es/ar/zh/ru
  floor_file_name: string | null;
  en_file_name: string | null;
  fr_file_name: string | null;
  es_file_name: string | null;
  ar_file_name: string | null;
  zh_file_name: string | null;
  ru_file_name: string | null;
  // Verbatim records (null if unavailable)
  pv_en: string | null;
  pv_fr: string | null;
  pv_es: string | null;
  pv_ar: string | null;
  pv_zh: string | null;
  pv_ru: string | null;
}

/** Count speakers from the _speakers.txt sidecar file (## headers = one per speaker) */
function countSpeakersFromSidecar(symbolSafe: string, lang: string): number {
  const sidecarPath = path.join(GT_CACHE_DIR, symbolSafe, `${lang}_speakers.txt`);
  if (!fs.existsSync(sidecarPath)) return 0;
  const content = fs.readFileSync(sidecarPath, 'utf-8');
  return (content.match(/^## /gm) || []).length;
}

/** Download a Kaltura audio URL and convert to MP3. Returns local file path or null on failure. */
async function downloadAsMP3(audioUrl: string, destPath: string): Promise<string | null> {
  if (fs.existsSync(destPath)) {
    console.log(`    cached`);
    return destPath;
  }
  try {
    const res = await fetch(audioUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const tmpPath = destPath.replace(/\.mp3$/, '.tmp.m4a');
    fs.writeFileSync(tmpPath, buf);
    execSync(`ffmpeg -i "${tmpPath}" -q:a 2 "${destPath}" -y`, { stdio: 'pipe' });
    fs.unlinkSync(tmpPath);
    console.log(`    saved ${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB`);
    return destPath;
  } catch (err) {
    console.warn(`    failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Fetch and cache a PV document. Returns text or null. */
async function fetchPV(symbol: string, lang: string, symbolSafe: string): Promise<string | null> {
  const gtCachePath = path.join(GT_CACHE_DIR, symbolSafe, `${lang}.txt`);
  if (fs.existsSync(gtCachePath)) {
    const text = fs.readFileSync(gtCachePath, 'utf-8');
    console.log(`    GT cached (${text.length} chars)`);
    return text;
  }
  try {
    const langCode = DOC_LANG_CODES[lang] || lang;
    const pdfBuffer = await fetchPVDocument(symbol, lang);
    const parsed = await parsePVDocument(pdfBuffer);
    fs.mkdirSync(PDF_DIR, { recursive: true });
    fs.writeFileSync(path.join(PDF_DIR, `${symbolSafe}_${lang}.pdf`), pdfBuffer);
    fs.mkdirSync(path.dirname(gtCachePath), { recursive: true });
    fs.writeFileSync(gtCachePath, parsed.fullText);
    if (parsed.speakers.length > 0) {
      const speakersText = parsed.speakers.map(s =>
        `## ${s.name}${s.affiliation ? ` (${s.affiliation})` : ''}\n${s.text.trim()}`
      ).join('\n\n');
      fs.writeFileSync(path.join(GT_CACHE_DIR, symbolSafe, `${lang}_speakers.txt`), speakersText);
    }
    console.log(`    GT fetched (${parsed.fullText.length} chars, ${parsed.speakers.length} speakers)`);
    return parsed.fullText;
  } catch (err) {
    console.warn(`    GT unavailable: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function prepareSession(session: SessionConfig, entryId: string): Promise<CorpusEntry> {
  const symbolSafe = session.symbol.replace(/\//g, '_');
  const { languages: availableLangs } = await getAvailableAudioLanguages(entryId);

  const audioByLang: Record<string, string> = {};
  for (const flavor of availableLangs) {
    audioByLang[flavor.language] = flavor.audioUrl;
  }

  // --- Floor + per-language audio + PV — all in parallel ---
  const langAudio: Record<string, string | null> = {};
  const langPV: Record<string, string | null> = {};
  let durationMs = 0;
  let numSpeakers = 0;

  const floorPromise = (async () => {
    if (!audioByLang['interlingua']) return null;
    const floorPath = path.join(AUDIO_DIR, `${symbolSafe}_floor.mp3`);
    return downloadAsMP3(audioByLang['interlingua'], floorPath);
  })();

  await Promise.all(Object.entries(UN_LANGUAGES).map(async ([iso, fullName]) => {
    const audioPath = path.join(AUDIO_DIR, `${symbolSafe}_${iso}.mp3`);
    const [audioResult, pvResult] = await Promise.all([
      audioByLang[fullName]
        ? downloadAsMP3(audioByLang[fullName], audioPath)
        : Promise.resolve(null),
      fetchPV(session.symbol, iso, symbolSafe),
    ]);
    langAudio[iso] = (audioResult && pvResult) ? `data/${symbolSafe}_${iso}.mp3` : null;
    langPV[iso] = pvResult;
  }));

  const audioFloor = await floorPromise;

  // Duration from English audio (or any available)
  const enAudioPath = path.join(AUDIO_DIR, `${symbolSafe}_en.mp3`);
  if (fs.existsSync(enAudioPath)) {
    durationMs = Math.round((fs.statSync(enAudioPath).size / 12000) * 1000);
  }

  // Speakers from English PV (best parsed)
  numSpeakers = countSpeakersFromSidecar(symbolSafe, 'en');

  return {
    symbol: session.symbol,
    webtv_url: `https://webtv.un.org/en/asset/${session.assetId}`,
    duration_ms: durationMs,
    num_speakers: numSpeakers,
    floor_file_name: audioFloor ? `data/${symbolSafe}_floor.mp3` : null,
    en_file_name: langAudio['en'] ? `data/${symbolSafe}_en.mp3` : null,
    fr_file_name: langAudio['fr'] ? `data/${symbolSafe}_fr.mp3` : null,
    es_file_name: langAudio['es'] ? `data/${symbolSafe}_es.mp3` : null,
    ar_file_name: langAudio['ar'] ? `data/${symbolSafe}_ar.mp3` : null,
    zh_file_name: langAudio['zh'] ? `data/${symbolSafe}_zh.mp3` : null,
    ru_file_name: langAudio['ru'] ? `data/${symbolSafe}_ru.mp3` : null,
    pv_en: langPV['en'],
    pv_fr: langPV['fr'],
    pv_es: langPV['es'],
    pv_ar: langPV['ar'],
    pv_zh: langPV['zh'],
    pv_ru: langPV['ru'],
  };
}

const README_CONTENT = `---
license: cc-by-4.0
task_categories:
- automatic-speech-recognition
- translation
language:
- en
- fr
- es
- ar
- zh
- ru
tags:
- multilingual
- speech
- united-nations
- verbatim-records
pretty_name: UN Transcription Corpus
size_categories:
- n<1K
---

# UN Transcription Corpus

Audio recordings from [UN Web TV](https://webtv.un.org) paired with official verbatim records in all 6 UN official languages. One row per meeting session.

## Audio Tracks

Each session has up to 7 audio tracks:

- \`audio_floor\` — original floor audio (uninterpreted, multilingual mix of whatever languages delegates spoke)
- \`audio_en/fr/es/ar/zh/ru\` — simultaneous interpretation into each UN official language

The floor track is the richest source: it contains original speech in whatever language each delegate used. Interpretation tracks are useful for evaluating ASR on interpreted speech.

## Verbatim Records

\`pv_en/fr/es/ar/zh/ru\` — official UN verbatim records extracted from [documents.un.org](https://documents.un.org). Preamble stripped; spoken content only.

**Note on WER**: Verbatim records are lightly edited for publication, so WER of 20–40% is expected even for high-quality ASR. For Chinese and Arabic, CER is the primary metric.

## Schema

| Column | Description |
|---|---|
| \`symbol\` | UN document symbol, e.g. \`S/PV.10100\` |
| \`webtv_url\` | Stable URL to the session on UN Web TV |
| \`duration_ms\` | Session duration in milliseconds |
| \`num_speakers\` | Number of speaker turns in the verbatim record |
| \`floor\` | Floor audio (MP3) |
| \`{lang}\` | Interpretation audio per language (MP3, null if unavailable) |
| \`pv_{lang}\` | Verbatim record text per language (null if unavailable) |

## Attribution

Audio: © United Nations, [UN Web TV](https://webtv.un.org). Reproduced under the [UN Terms of Use](https://www.un.org/en/about-us/terms-of-use).
Transcripts: [United Nations Official Document System](https://documents.un.org). Public domain.
`;

async function main() {
  const sessionsPath = path.join(__dirname, '..', 'corpus', 'sessions.json');
  let sessions: SessionConfig[] = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'));

  if (SYMBOL_FILTER) {
    sessions = sessions.filter(s => s.symbol === SYMBOL_FILTER);
    if (sessions.length === 0) {
      console.error(`Symbol not found in sessions.json: ${SYMBOL_FILTER}`);
      process.exit(1);
    }
  }

  console.log(`Preparing corpus for ${sessions.length} sessions...`);
  if (DRY_RUN) console.log('DRY RUN — no upload');

  const CONCURRENCY = 3;
  const entriesMap = new Map<string, CorpusEntry>();

  async function processSession(session: SessionConfig) {
    console.log(`\n=== ${session.symbol} ===`);
    const entryId = await resolveEntryId(session.assetId);
    if (!entryId) { console.warn(`  Could not resolve entry ID`); return; }
    const entry = await prepareSession(session, entryId);
    entriesMap.set(session.symbol, entry);
  }

  // Process sessions with bounded concurrency
  let idx = 0;
  async function worker() {
    while (idx < sessions.length) {
      const session = sessions[idx++];
      await processSession(session);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Restore original order
  const entries = sessions.map(s => entriesMap.get(s.symbol)).filter(Boolean) as CorpusEntry[];

  console.log(`\nPrepared ${entries.length} sessions.`);

  // Write metadata.jsonl (AudioFolder format)
  // When filtering by symbol, append/update rather than overwrite
  const metadataPath = path.join(CORPUS_DIR, 'metadata.jsonl');
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  if (SYMBOL_FILTER && fs.existsSync(metadataPath)) {
    // Merge: replace existing row for this symbol, or append
    const existing = fs.readFileSync(metadataPath, 'utf-8')
      .split('\n').filter(Boolean)
      .map(l => JSON.parse(l))
      .filter((e: CorpusEntry) => e.symbol !== SYMBOL_FILTER);
    const merged = [...existing, ...entries];
    fs.writeFileSync(metadataPath, merged.map(e => JSON.stringify(e)).join('\n') + '\n');
  } else {
    fs.writeFileSync(metadataPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  }
  console.log(`Written: ${metadataPath}`);

  if (DRY_RUN || SYMBOL_FILTER) {
    console.log(SYMBOL_FILTER ? '\nDownload complete.' : '\nDry run complete. Files are in:' + CORPUS_DIR);
    return;
  }

  // Upload to HuggingFace
  console.log(`\nUploading to ${HF_REPO}...`);
  const credentials = { accessToken: HF_TOKEN };

  try {
    await createRepo({ repo: { type: 'dataset', name: HF_REPO }, credentials });
  } catch (err: unknown) {
    if (!(err instanceof Error && err.message.includes('already created'))) throw err;
  }

  const files: Array<{ path: string; content: Blob }> = [];
  files.push({ path: 'README.md', content: new Blob([README_CONTENT]) });
  files.push({ path: 'metadata.jsonl', content: new Blob([fs.readFileSync(metadataPath)]) });

  // Collect all audio files referenced in entries
  const audioPaths = new Set<string>();
  for (const entry of entries) {
    for (const col of ['floor_file_name', 'en_file_name', 'fr_file_name', 'es_file_name', 'ar_file_name', 'zh_file_name', 'ru_file_name'] as const) {
      if (entry[col]) audioPaths.add(entry[col] as string);
    }
  }
  for (const hfPath of audioPaths) {
    const localPath = path.join(AUDIO_DIR, path.basename(hfPath));
    if (fs.existsSync(localPath)) {
      files.push({ path: hfPath, content: new Blob([fs.readFileSync(localPath)], { type: 'audio/mpeg' }) });
    }
  }

  console.log(`Uploading ${files.length} files...`);
  await uploadFiles({
    repo: { type: 'dataset', name: HF_REPO },
    credentials,
    files,
    commitTitle: `Restructure corpus: one row per session, ${entries.length} sessions`,
  });

  console.log(`\nDone! https://huggingface.co/datasets/${HF_REPO}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
