/**
 * English bake-off harness: AssemblyAI Universal-3.5 Pro vs azure-llm-speech.
 *
 * This does NOT reuse `eval/run.ts`. That harness caches on
 * `raw/<symbol>/<providerName>_<lang>.json`, which cannot distinguish two arms
 * that share a provider name but differ in input audio (our A0/A1 and A2/A3) —
 * it would silently serve one arm's transcript as the other's. Every artifact
 * here is keyed by ARM, and each run also records the sha256 of the exact bytes
 * that were sent, so an input mix-up is detectable after the fact rather than
 * assumed away.
 *
 * Both providers are driven directly rather than through `lib/providers/*` so
 * that timing can be decomposed. The production wrappers bury upload inside the
 * call and poll AssemblyAI every 5 s, which quantizes every latency to a 5 s
 * grid — on an 81 s file that IS the measurement.
 *
 * Usage:
 *   npx tsx eval/analysis/en-bakeoff/run-bakeoff.ts --arms=A1,A2 --pass=1
 *   npx tsx eval/analysis/en-bakeoff/run-bakeoff.ts --arms=A0,A3 --pass=1 --set=headline
 *   npx tsx eval/analysis/en-bakeoff/run-bakeoff.ts --arms=A1,A2 --pass=1 --set=diagnostic
 */
import "../../../lib/load-env";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { HEADLINE, DIAGNOSTIC, type Session } from "./sessions";

const OUT = "/Volumes/SSDAStorage/un-en-bakeoff";
const RAW = path.join(OUT, "raw");
const RUNS_JSONL = path.join(OUT, "runs.jsonl");
const SRC_AUDIO = "/Volumes/SSDAStorage/transcripts-eval-corpus-data-audio";
const DERIVED = path.join(OUT, "audio-derived");

const AZ_KEY = process.env.AZURE_SPEECH_KEY!;
const AZ_EP = process.env.AZURE_SPEECH_ENDPOINT!.replace(/\/$/, "");
const AZ_URL = `${AZ_EP}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;
const AAI_KEY = process.env.ASSEMBLYAI_API_KEY!;

type ArmId = "A0" | "A1" | "A2" | "A3";

interface Arm {
  id: ArmId;
  vendor: "assemblyai" | "azure";
  label: string;
  /** returns the absolute path of the file to send for a session */
  file: (s: Session) => string;
}

const ARMS: Record<ArmId, Arm> = {
  A0: {
    id: "A0",
    vendor: "assemblyai",
    label: "AssemblyAI U-3.5 Pro @ 64k mono mp3 (matched-input control)",
    file: (s) => path.join(DERIVED, `${s.dir}_en_64k.mp3`),
  },
  A1: {
    id: "A1",
    vendor: "assemblyai",
    label: "AssemblyAI U-3.5 Pro @ original 190k AAC (production today)",
    file: (s) => path.join(SRC_AUDIO, `${s.dir}_en.m4a`),
  },
  A2: {
    id: "A2",
    vendor: "azure",
    label: "azure-llm-speech @ 64k mono mp3 (production-equivalent config)",
    file: (s) => path.join(DERIVED, `${s.dir}_en_64k.mp3`),
  },
  A3: {
    id: "A3",
    vendor: "azure",
    label: "azure-llm-speech @ 128k mono mp3 (transcode-headroom control)",
    file: (s) => path.join(DERIVED, `${s.dir}_en_128k.mp3`),
  },
};

interface RunRecord {
  arm: ArmId;
  vendor: string;
  symbol: string;
  dir: string;
  pass: number;
  startedAt: string;
  finishedAt: string;
  audioSeconds: number;
  bytesSent: number;
  sha256: string;
  ok: boolean;
  error?: string;
  /** every HTTP status seen, in order, including retries */
  attempts: { status: number | string; ms: number }[];
  retries: number;
  tUploadMs: number | null;
  tProcessMs: number | null;
  tTotalMs: number;
  billedUnits: number | null;
  billingMeter: string | null;
  region: string | null;
  speakers: number | null;
  utterances: number | null;
  words: number | null;
  chars: number | null;
  reportedDurationMs: number | null;
  modelUsed: string | null;
  rawPath: string;
}

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function appendRun(r: RunRecord) {
  fs.appendFileSync(RUNS_JSONL, JSON.stringify(r) + "\n");
}

function alreadyDone(arm: ArmId, dir: string, pass: number): boolean {
  if (!fs.existsSync(RUNS_JSONL)) return false;
  const lines = fs.readFileSync(RUNS_JSONL, "utf-8").trim().split("\n");
  for (const l of lines) {
    if (!l) continue;
    try {
      const r = JSON.parse(l) as RunRecord;
      if (r.arm === arm && r.dir === dir && r.pass === pass && r.ok) return true;
    } catch {}
  }
  return false;
}

// ---------------------------------------------------------------- AssemblyAI

async function runAssemblyai(arm: Arm, s: Session, pass: number): Promise<RunRecord> {
  const file = arm.file(s);
  const bytes = fs.readFileSync(file);
  const started = new Date();
  const attempts: RunRecord["attempts"] = [];
  const base = {
    arm: arm.id,
    vendor: arm.vendor,
    symbol: s.symbol,
    dir: s.dir,
    pass,
    startedAt: started.toISOString(),
    audioSeconds: s.audioSeconds,
    bytesSent: bytes.length,
    sha256: sha256(bytes),
    billingMeter: null,
    region: null,
  };
  const rawPath = path.join(RAW, `${arm.id}__${s.dir}__p${pass}.json`);
  const t0 = Date.now();

  // --- upload leg, timed on its own
  let uploadUrl: string;
  const tUp0 = Date.now();
  {
    let res: Response | undefined;
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, [2000, 4000, 8000, 16000][i - 1]));
      const ta = Date.now();
      try {
        res = await fetch("https://api.assemblyai.com/v2/upload", {
          method: "POST",
          headers: { authorization: AAI_KEY, "content-type": "application/octet-stream" },
          body: new Uint8Array(bytes),
        });
        attempts.push({ status: res.status, ms: Date.now() - ta });
      } catch (e) {
        lastErr = e;
        attempts.push({ status: `NETERR:${(e as Error).message.slice(0, 60)}`, ms: Date.now() - ta });
        res = undefined;
        continue;
      }
      if (res.ok) break;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    }
    if (!res || !res.ok) {
      return {
        ...base,
        finishedAt: new Date().toISOString(),
        ok: false,
        error: res ? `upload HTTP ${res.status}: ${await res.text()}` : `upload network: ${(lastErr as Error)?.message}`,
        attempts,
        retries: Math.max(0, attempts.length - 1),
        tUploadMs: Date.now() - tUp0,
        tProcessMs: null,
        tTotalMs: Date.now() - t0,
        billedUnits: null,
        speakers: null,
        utterances: null,
        words: null,
        chars: null,
        reportedDurationMs: null,
        modelUsed: null,
        rawPath,
      };
    }
    uploadUrl = ((await res.json()) as { upload_url: string }).upload_url;
  }
  const tUploadMs = Date.now() - tUp0;

  // --- job leg (submit + poll at 1 s)
  const tJob0 = Date.now();
  const subA = Date.now();
  const sub = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: { authorization: AAI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: uploadUrl,
      speaker_labels: true,
      language_code: "en",
      speech_models: ["universal-3-5-pro", "universal-2"],
    }),
  });
  attempts.push({ status: sub.status, ms: Date.now() - subA });
  if (!sub.ok) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      ok: false,
      error: `submit HTTP ${sub.status}: ${await sub.text()}`,
      attempts,
      retries: 0,
      tUploadMs,
      tProcessMs: null,
      tTotalMs: Date.now() - t0,
      billedUnits: null,
      speakers: null,
      utterances: null,
      words: null,
      chars: null,
      reportedDurationMs: null,
      modelUsed: null,
      rawPath,
    };
  }
  const { id } = (await sub.json()) as { id: string };

  let result: any;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const p = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: AAI_KEY },
    });
    result = await p.json();
    if (result.status === "completed" || result.status === "error") break;
  }
  const tProcessMs = Date.now() - tJob0;

  if (result.status === "error") {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      ok: false,
      error: `job error: ${result.error}`,
      attempts,
      retries: Math.max(0, attempts.length - 2),
      tUploadMs,
      tProcessMs,
      tTotalMs: Date.now() - t0,
      billedUnits: null,
      speakers: null,
      utterances: null,
      words: null,
      chars: null,
      reportedDurationMs: null,
      modelUsed: null,
      rawPath,
    };
  }

  fs.writeFileSync(rawPath, JSON.stringify(result));
  const spk = new Set((result.utterances || []).map((u: any) => u.speaker));
  return {
    ...base,
    finishedAt: new Date().toISOString(),
    ok: true,
    attempts,
    retries: Math.max(0, attempts.length - 2),
    tUploadMs,
    tProcessMs,
    tTotalMs: Date.now() - t0,
    billedUnits: result.audio_duration ?? null,
    speakers: spk.size,
    utterances: (result.utterances || []).length,
    words: (result.words || []).length,
    chars: (result.text || "").length,
    reportedDurationMs: result.audio_duration ? result.audio_duration * 1000 : null,
    modelUsed: result.speech_model_used ?? result.speech_model ?? null,
    rawPath,
  };
}

// --------------------------------------------------------------------- Azure

async function runAzure(arm: Arm, s: Session, pass: number): Promise<RunRecord> {
  const file = arm.file(s);
  const bytes = fs.readFileSync(file);
  const started = new Date();
  const attempts: RunRecord["attempts"] = [];
  const rawPath = path.join(RAW, `${arm.id}__${s.dir}__p${pass}.json`);
  const base = {
    arm: arm.id,
    vendor: arm.vendor,
    symbol: s.symbol,
    dir: s.dir,
    pass,
    startedAt: started.toISOString(),
    audioSeconds: s.audioSeconds,
    bytesSent: bytes.length,
    sha256: sha256(bytes),
  };
  const t0 = Date.now();

  const definition = {
    enhancedMode: { enabled: true, task: "transcribe" },
    // 35 is the documented ceiling; production sends 20, which needlessly caps
    // large open debates. Measured at the ceiling here so diarization is not
    // handicapped relative to what the service can do.
    diarization: { enabled: true, maxSpeakers: 35 },
    locales: ["en-US"],
  };

  let res: Response | undefined;
  let lastErr: unknown;
  const BACKOFF = [2000, 4000, 8000, 16000];
  for (let i = 0; i < 5; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, BACKOFF[i - 1]));
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), path.basename(file));
    form.append("definition", JSON.stringify(definition));
    const ta = Date.now();
    try {
      res = await fetch(AZ_URL, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": AZ_KEY },
        body: form,
      });
      attempts.push({ status: res.status, ms: Date.now() - ta });
    } catch (e) {
      lastErr = e;
      attempts.push({ status: `NETERR:${(e as Error).message.slice(0, 60)}`, ms: Date.now() - ta });
      res = undefined;
      continue;
    }
    if (res.ok) break;
    if (![429, 500, 502, 503, 504].includes(res.status)) break;
  }

  const tTotalMs = Date.now() - t0;
  const billingHeader = res?.headers.get("csp-billing-usage") ?? null;
  const region = res?.headers.get("x-ms-region") ?? null;
  let billedUnits: number | null = null;
  let billingMeter: string | null = null;
  if (billingHeader) {
    const m = billingHeader.match(/([\w.]+)=(\d+)/);
    if (m) {
      billingMeter = m[1];
      billedUnits = Number(m[2]);
    }
  }

  if (!res || !res.ok) {
    return {
      ...base,
      finishedAt: new Date().toISOString(),
      ok: false,
      error: res ? `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}` : `network: ${(lastErr as Error)?.message}`,
      attempts,
      retries: Math.max(0, attempts.length - 1),
      tUploadMs: null,
      tProcessMs: null,
      tTotalMs,
      billedUnits,
      billingMeter,
      region,
      speakers: null,
      utterances: null,
      words: null,
      chars: null,
      reportedDurationMs: null,
      modelUsed: null,
      rawPath,
    };
  }

  const j = (await res.json()) as any;
  fs.writeFileSync(rawPath, JSON.stringify(j));
  const spk = new Set((j.phrases || []).map((p: any) => String(p.speaker ?? "1")));
  const text = (j.combinedPhrases || []).map((c: any) => c.text).join("\n");
  const wordCount = (j.phrases || []).reduce((n: number, p: any) => n + (p.words?.length || 0), 0);

  return {
    ...base,
    finishedAt: new Date().toISOString(),
    ok: true,
    attempts,
    retries: Math.max(0, attempts.length - 1),
    // Azure's upload is INSIDE the POST and cannot be separated directly.
    // Left null on purpose; it is recovered later by regressing tTotal on
    // bytesSent and audioSeconds across all runs (see analyse-speed.ts).
    tUploadMs: null,
    tProcessMs: null,
    tTotalMs,
    billedUnits,
    billingMeter,
    region,
    speakers: spk.size,
    utterances: (j.phrases || []).length,
    words: wordCount,
    chars: text.length,
    reportedDurationMs: j.durationMilliseconds ?? null,
    modelUsed: "llm-speech-enhanced-default(unnamed)",
    rawPath,
  };
}

// ---------------------------------------------------------------------- main

(async () => {
  const args = process.argv.slice(2);
  const armIds = (args.find((a) => a.startsWith("--arms="))?.split("=")[1] || "A1,A2").split(",") as ArmId[];
  const pass = Number(args.find((a) => a.startsWith("--pass="))?.split("=")[1] || 1);
  const setName = args.find((a) => a.startsWith("--set="))?.split("=")[1] || "headline";
  const sessions: Session[] = setName === "diagnostic" ? DIAGNOSTIC : setName === "all" ? [...HEADLINE, ...DIAGNOSTIC] : HEADLINE;

  fs.mkdirSync(RAW, { recursive: true });

  console.log(`arms=${armIds.join(",")} pass=${pass} set=${setName} sessions=${sessions.length}`);

  for (const s of sessions) {
    // Interleave arms WITHIN a session so that provider-side queue conditions
    // at a given moment hit both vendors, rather than one vendor getting the
    // quiet hour and the other the busy one (confound C3).
    for (const armId of armIds) {
      const arm = ARMS[armId];
      if (alreadyDone(armId, s.dir, pass)) {
        console.log(`  [${armId}] ${s.symbol} — already done, skipping`);
        continue;
      }
      const f = arm.file(s);
      if (!fs.existsSync(f)) {
        console.log(`  [${armId}] ${s.symbol} — MISSING INPUT ${f}, skipping`);
        continue;
      }
      process.stdout.write(`  [${armId}] ${s.symbol} (${(s.audioSeconds / 60).toFixed(1)} min, ${(fs.statSync(f).size / 1e6).toFixed(1)} MB) ... `);
      const rec = arm.vendor === "assemblyai" ? await runAssemblyai(arm, s, pass) : await runAzure(arm, s, pass);
      appendRun(rec);
      if (rec.ok) {
        const rtf = s.audioSeconds / ((rec.tProcessMs ?? rec.tTotalMs) / 1000);
        console.log(
          `ok ${(rec.tTotalMs / 1000).toFixed(1)}s total` +
            (rec.tUploadMs !== null ? ` (up ${(rec.tUploadMs / 1000).toFixed(1)}s, job ${((rec.tProcessMs ?? 0) / 1000).toFixed(1)}s)` : "") +
            ` | ${rtf.toFixed(0)}x RT | ${rec.speakers} spk, ${rec.utterances} utt, ${rec.chars} chars` +
            (rec.retries ? ` | RETRIES=${rec.retries}` : ""),
        );
      } else {
        console.log(`FAILED — ${rec.error?.slice(0, 200)}`);
      }
    }
  }
  console.log("\nBAKEOFF PASS COMPLETE");
})();
