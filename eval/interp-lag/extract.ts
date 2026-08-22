/**
 * Turn every language track of a meeting into one comparable representation:
 * a stream of timestamped tokens, chunked into units of roughly equal
 * *information*, so that floor and interpreted tracks can be aligned.
 *
 * The hard problem this solves is that our providers disagree violently about
 * what a segment is. Azure LLM Speech merges an entire 27-second statement
 * into a single "sentence"; Speechmatics emits 2-second fragments; AssemblyAI
 * sits in between. Comparing segment start times across providers would
 * therefore measure provider segmentation policy, not interpreter lag.
 *
 * So we go down to tokens (real word timings where the provider gives them,
 * linear interpolation within the segment where it doesn't) and back up to
 * chunks sized by each track's OWN speaking rate — a chunk is however many
 * tokens that track emits in ~8 seconds. A chunk is then the same amount of
 * speech in every language, regardless of how the provider segmented it or
 * how information-dense the language is.
 */
import fs from "fs";
import path from "path";
import { Pool } from "pg";

const CACHE_DIR = path.join(__dirname, "cache", "floor");

/** Seconds of speech one chunk should represent, in the track's own tempo. */
export const CHUNK_SECONDS = 8;

export interface TimedToken {
  text: string;
  start: number;
  end: number;
  /** Per-word language label, floor track only (Speechmatics Melia). */
  language?: string;
  /**
   * True when this token's time was interpolated inside a segment rather than
   * measured. Azure LLM Speech (fr/es/ar/ru) returns no word timings and
   * merges whole statements into single segments, so a token's time there can
   * be wrong by half the segment — which on a 27 s segment is ±13 s, far larger
   * than the lag being measured. Carried so the analysis can restrict itself to
   * precisely-timed anchors.
   */
  interpolated?: boolean;
  /** Duration of the segment this token came from, in ms. */
  segMs?: number;
}

export interface Chunk {
  idx: number;
  text: string;
  start: number;
  end: number;
  /** Dominant per-word language label across the chunk (floor track only). */
  language?: string;
}

export interface Track {
  kalturaId: string;
  lang: string;
  source: "db" | "melia-cache";
  tokens: TimedToken[];
  chunks: Chunk[];
  /** Tokens per second of *voiced* time — the tempo used to size chunks. */
  tokenRate: number;
}

/** Languages written without spaces, tokenized per character. */
const CHARACTER_LANGS = new Set(["zh", "ja", "cmn", "yue"]);

function tokenize(text: string, lang: string): string[] {
  if (CHARACTER_LANGS.has(lang)) {
    // Keep CJK ideographs and any embedded Latin/digit runs as units.
    return text.match(/[㐀-鿿豈-﫿]|[A-Za-z0-9]+/g) ?? [];
  }
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Spread tokens across [start, end] proportionally to their length. Used only
 * for providers that give no word timings; a token's assigned time is then
 * accurate to roughly half the segment length, which is why long merged
 * segments (Azure) are the dominant error term on those tracks.
 */
function interpolate(
  tokens: string[],
  start: number,
  end: number,
): TimedToken[] {
  const total = tokens.reduce((a, t) => a + t.length, 0) || 1;
  const span = Math.max(end - start, 1);
  let acc = 0;
  return tokens.map((t) => {
    const s = start + (acc / total) * span;
    acc += t.length;
    const e = start + (acc / total) * span;
    return { text: t, start: s, end: e, interpolated: true, segMs: span };
  });
}

interface Segment {
  text: string;
  start: number;
  end: number;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    language?: string;
  }>;
}

function segmentsToTokens(segments: Segment[], lang: string): TimedToken[] {
  const out: TimedToken[] = [];
  for (const seg of segments) {
    if (seg.words?.length) {
      for (const w of seg.words) {
        if (!w.text?.trim()) continue;
        out.push({
          text: w.text,
          start: w.start,
          end: w.end,
          language: w.language,
          interpolated: false,
          segMs: w.end - w.start,
        });
      }
    } else {
      const toks = tokenize(seg.text ?? "", lang);
      if (toks.length) out.push(...interpolate(toks, seg.start, seg.end));
    }
  }
  // Providers occasionally emit out-of-order segments; alignment assumes
  // monotone time, so sort rather than silently warping later.
  return out.sort((a, b) => a.start - b.start);
}

function buildChunks(
  tokens: TimedToken[],
  lang: string,
  targetSeconds: number,
): Chunk[] {
  if (!tokens.length) return [];
  // Voiced time, not wall time: silence between statements must not dilute the
  // tempo estimate or chunks become enormous in sparse meetings.
  const voicedMs = tokens.reduce(
    (a, t) => a + Math.max(0, Math.min(t.end - t.start, 2000)),
    0,
  );
  const rate = voicedMs > 0 ? tokens.length / (voicedMs / 1000) : 2;
  const per = Math.max(4, Math.min(80, Math.round(rate * targetSeconds)));

  const chunks: Chunk[] = [];
  for (let i = 0; i < tokens.length; i += per) {
    const slice = tokens.slice(i, i + per);
    const langCounts = new Map<string, number>();
    for (const t of slice) {
      if (t.language) langCounts.set(t.language, (langCounts.get(t.language) ?? 0) + 1);
    }
    const dominant = [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const sep = CHARACTER_LANGS.has(lang) ? "" : " ";
    chunks.push({
      idx: chunks.length,
      text: slice.map((t) => t.text).join(sep).trim(),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      language: dominant?.[0],
    });
  }
  return chunks;
}

/** Read one interpreted track out of the production DB. */
export async function loadDbTrack(
  pool: Pool,
  kalturaId: string,
  lang: string,
): Promise<Track | null> {
  const r = await pool.query(
    `SELECT content, time_offset_ms
       FROM webtv.transcripts
      WHERE kaltura_id = $1 AND language_code = $2
        AND transcription_status = 'completed'
      ORDER BY updated_at DESC LIMIT 1`,
    [kalturaId, lang],
  );
  if (!r.rows.length) return null;
  const offset = r.rows[0].time_offset_ms ?? 0;
  const content = r.rows[0].content as {
    statements?: Array<{
      paragraphs?: Array<{ sentences?: Segment[] }>;
    }>;
  };

  const segments: Segment[] = [];
  for (const st of content.statements ?? [])
    for (const p of st.paragraphs ?? [])
      for (const s of p.sentences ?? []) segments.push(s);

  const tokens = segmentsToTokens(segments, lang).map((t) => ({
    ...t,
    start: t.start + offset,
    end: t.end + offset,
  }));

  return finish(kalturaId, lang, "db", tokens);
}

/** Read the Melia-transcribed floor track from the local cache. */
export function loadFloorTrack(kalturaId: string): Track | null {
  const p = path.join(CACHE_DIR, `${kalturaId}.json`);
  if (!fs.existsSync(p)) return null;
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as {
    utterances: Segment[];
  };
  const tokens = segmentsToTokens(data.utterances, "floor");
  return finish(kalturaId, "floor", "melia-cache", tokens);
}

function finish(
  kalturaId: string,
  lang: string,
  source: Track["source"],
  tokens: TimedToken[],
): Track {
  const voicedMs = tokens.reduce(
    (a, t) => a + Math.max(0, Math.min(t.end - t.start, 2000)),
    0,
  );
  return {
    kalturaId,
    lang,
    source,
    tokens,
    chunks: buildChunks(tokens, lang, CHUNK_SECONDS),
    tokenRate: voicedMs > 0 ? tokens.length / (voicedMs / 1000) : 0,
  };
}
