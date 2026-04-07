import fs from "fs";
import https from "https";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "./utils";

/** POST JSON via https module (avoids undici headers timeout on long requests) */
function httpsPostJson(
  url: string,
  body: object,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: 600_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });
    req.write(data);
    req.end();
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = "gemini-3-flash-preview";
const BASE = "https://generativelanguage.googleapis.com";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese",
  ru: "Russian",
};

/** Upload audio file via Gemini Files API (resumable upload) */
async function uploadFile(
  filePath: string,
): Promise<{ name: string; uri: string }> {
  const fileSize = fs.statSync(filePath).size;
  const fileData = fs.readFileSync(filePath);

  // Start resumable upload
  const startRes = await fetch(
    `${BASE}/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": "audio/mp4",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { displayName: `eval-${Date.now()}` } }),
    },
  );
  if (!startRes.ok)
    throw new Error(
      `Gemini upload start failed ${startRes.status}: ${await startRes.text()}`,
    );
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned");

  // Upload the bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileData,
  });
  if (!uploadRes.ok)
    throw new Error(
      `Gemini upload failed ${uploadRes.status}: ${await uploadRes.text()}`,
    );
  const result = (await uploadRes.json()) as {
    file: { name: string; uri: string; state: string };
  };
  return result.file;
}

/** Poll until file state is ACTIVE */
async function waitForFile(name: string): Promise<void> {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`);
    const file = (await res.json()) as { state: string };
    if (file.state === "ACTIVE") return;
    if (file.state === "FAILED") throw new Error("File processing failed");
    if (i % 6 === 5)
      console.log(`  [Gemini] File still processing... (${(i + 1) * 5}s)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Parse MM:SS or HH:MM:SS timestamp to milliseconds */
function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3)
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return 0;
}

interface GeminiSegment {
  speaker: string;
  timestamp: string;
  content: string;
}

export const gemini: TranscriptionProvider = {
  name: "gemini",

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const langName = LANGUAGE_NAMES[lang] || lang;

    // Get local audio file
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Gemini"));

    try {
      // Upload to Gemini Files API
      console.log(`  [Gemini] Uploading audio...`);
      const file = await uploadFile(filePath);
      console.log(`  [Gemini] File uploaded: ${file.name}`);

      // Wait for processing
      console.log(`  [Gemini] File URI: ${file.uri}`);
      await waitForFile(file.name);

      // Generate transcription with structured diarization output
      console.log(`  [Gemini] Transcribing with ${MODEL}...`);
      const requestBody = {
        contents: [
          {
            parts: [
              { fileData: { mimeType: "audio/mp4", fileUri: file.uri } },
              {
                text: [
                  `Transcribe this audio recording verbatim in ${langName}.`,
                  "",
                  "Requirements:",
                  "1. Identify distinct speakers (Speaker 1, Speaker 2, etc.).",
                  "2. Provide timestamps for each segment (Format: MM:SS).",
                  "3. Transcribe every word exactly as spoken — do not correct grammar, summarize, or paraphrase.",
                  "4. Include filler words, false starts, and repetitions.",
                  "5. This is a United Nations session — preserve all speaker statements faithfully.",
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 65536,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              segments: {
                type: "ARRAY",
                description:
                  "List of transcribed segments with speaker and timestamp.",
                items: {
                  type: "OBJECT",
                  properties: {
                    speaker: {
                      type: "STRING",
                      description: "Speaker identifier (e.g. Speaker 1)",
                    },
                    timestamp: {
                      type: "STRING",
                      description: "Timestamp in MM:SS format",
                    },
                    content: {
                      type: "STRING",
                      description: "Verbatim transcription of this segment",
                    },
                  },
                  required: ["speaker", "timestamp", "content"],
                },
              },
            },
            required: ["segments"],
          },
        },
      };

      const apiUrl = `${BASE}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const result = await httpsPostJson(apiUrl, requestBody);

      if (result.status !== 200) {
        throw new Error(
          `Gemini API error ${result.status}: ${result.body.slice(0, 500)}`,
        );
      }

      const raw = JSON.parse(result.body) as any;
      const responseText = (raw.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p.text || "")
        .join("")
        .trim();

      if (!responseText) {
        throw new Error(
          `Gemini returned empty transcription: ${JSON.stringify(raw.candidates?.[0]?.finishReason)}`,
        );
      }

      // Parse structured JSON response
      const parsed = JSON.parse(responseText) as { segments: GeminiSegment[] };
      const segments = parsed.segments || [];

      // Build utterances from segments
      const utterances: NormalizedTranscript["utterances"] = [];
      for (const seg of segments) {
        const startMs = parseTimestamp(seg.timestamp);
        const last = utterances[utterances.length - 1];
        if (last && last.speaker === seg.speaker) {
          last.end = startMs;
          last.text += " " + seg.content;
        } else {
          utterances.push({
            speaker: seg.speaker.replace(/^Speaker\s*/i, ""),
            start: startMs,
            end: startMs,
            text: seg.content,
          });
        }
      }

      // Set end times: each utterance ends when the next starts
      for (let i = 0; i < utterances.length - 1; i++) {
        if (utterances[i].end <= utterances[i].start) {
          utterances[i].end = utterances[i + 1].start;
        }
      }

      const fullText = segments
        .map((s) => s.content)
        .join(" ")
        .trim();
      const durationMs =
        utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

      console.log(
        `  [Gemini] Transcription: ${fullText.length} chars, ${segments.length} segments, ${utterances.length} utterances`,
      );

      // Clean up uploaded file
      await fetch(`${BASE}/v1beta/${file.name}?key=${GEMINI_API_KEY}`, {
        method: "DELETE",
      }).catch(() => {});

      return {
        provider: "gemini",
        language: lang,
        fullText,
        utterances,
        durationMs,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  },
};
