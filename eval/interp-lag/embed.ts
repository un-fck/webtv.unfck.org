/**
 * Cached multilingual chunk embeddings.
 *
 * `text-embedding-3-large` was chosen after a direct discrimination test on
 * realistic UN sentences: 5/5 cross-lingual retrieval en→fr, en→ar and en→zh,
 * with mean cosine 0.70–0.81 for true pairs against 0.18–0.22 for false ones.
 * A margin that wide is ample for the DTW, so the heavier options (LaBSE,
 * multilingual-e5, or pivoting everything through a translation model) buy
 * nothing here.
 *
 * Embeddings are cached on disk keyed by a hash of the text, because the
 * analysis gets re-run many times while the alignment parameters are tuned and
 * re-embedding the same corpus each pass is pure waste.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const MODEL = "text-embedding-3-large";
const DIM = 1024; // Truncated from 3072: MRL-trained, so this is a clean cut.
const CACHE = path.join(__dirname, "cache", "embeddings");
const BATCH = 256;
/** lib/providers/pricing.ts convention: USD per 1M input tokens. */
const USD_PER_M_TOKENS = 0.13;

let tokensUsed = 0;
export const embedSpend = () => (tokensUsed / 1e6) * USD_PER_M_TOKENS;

function keyFor(text: string): string {
  return crypto
    .createHash("sha1")
    .update(`${MODEL}:${DIM}:${text}`)
    .digest("hex");
}

function cachePath(key: string): string {
  // Shard by first byte — a flat directory of tens of thousands of files is
  // slow to stat on macOS.
  return path.join(CACHE, key.slice(0, 2), `${key}.bin`);
}

function readCached(key: string): Float32Array | null {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  return new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}

function writeCached(key: string, vec: Float32Array): void {
  const p = cachePath(key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(vec.buffer));
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIM }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
        usage?: { total_tokens?: number };
      };
      tokensUsed += json.usage?.total_tokens ?? 0;
      const out = new Array<Float32Array>(texts.length);
      for (const d of json.data) {
        // Truncated MRL vectors are no longer unit-norm; the DTW's cosine
        // assumes they are, so renormalise here rather than in the hot loop.
        const v = new Float32Array(d.embedding);
        let n = 0;
        for (let i = 0; i < v.length; i++) n += v[i] * v[i];
        n = Math.sqrt(n) || 1;
        for (let i = 0; i < v.length; i++) v[i] /= n;
        out[d.index] = v;
      }
      return out;
    }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`embeddings failed ${res.status}: ${await res.text()}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

/** Embed texts, hitting the API only for cache misses. */
export async function embedAll(texts: string[]): Promise<Float32Array[]> {
  const keys = texts.map(keyFor);
  const out = new Array<Float32Array | null>(texts.length).fill(null);
  const missing: number[] = [];

  for (let i = 0; i < texts.length; i++) {
    const hit = readCached(keys[i]);
    if (hit) out[i] = hit;
    else missing.push(i);
  }

  for (let b = 0; b < missing.length; b += BATCH) {
    const idxs = missing.slice(b, b + BATCH);
    // The API rejects empty strings; substitute a placeholder so indices line up.
    const vecs = await embedBatch(idxs.map((i) => texts[i] || " "));
    idxs.forEach((i, k) => {
      out[i] = vecs[k];
      writeCached(keys[i], vecs[k]);
    });
  }

  return out as Float32Array[];
}
