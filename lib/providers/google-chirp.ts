import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { GoogleAuth } from "google-auth-library";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "./utils";

// BCP-47 locale mapping
const LANG_MAP: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  ar: "ar-SA",
  zh: "cmn-Hans-CN",
  ru: "ru-RU",
};

const LOCATION = "us"; // multi-region; chirp_3 is only available in 'us' and 'eu' multi-regions

let authClient: Awaited<ReturnType<GoogleAuth["getClient"]>> | null = null;

async function getAccessToken(): Promise<string> {
  if (!authClient) {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    authClient = await auth.getClient();
  }
  const token = await authClient.getAccessToken();
  if (!token.token) throw new Error("Failed to get GCP access token");
  return token.token;
}

function getProjectId(): string {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS not set");
  const cred = JSON.parse(fs.readFileSync(credPath, "utf-8"));
  return cred.project_id;
}

/** Poll a long-running operation until done */
async function pollOperation(operationName: string): Promise<any> {
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(
      `https://${LOCATION}-speech.googleapis.com/v2/${operationName}`,
      { headers: { Authorization: `Bearer ${await getAccessToken()}` } },
    );
    const op = (await pollRes.json()) as {
      done?: boolean;
      response?: any;
      error?: any;
      metadata?: any;
    };
    if (op.error)
      throw new Error(`Chirp operation failed: ${JSON.stringify(op.error)}`);
    if (op.done) return op.response || op;
    if (i % 12 === 11)
      console.log(`  [Chirp] Still processing... (${(i + 1) * 5}s)`);
  }
}

/** Upload audio to GCS, returns gs:// URI */
async function uploadToGCS(
  filePath: string,
  bucket: string,
  objectName: string,
): Promise<string> {
  const token = await getAccessToken();
  const fileData = fs.readFileSync(filePath);

  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "audio/flac",
        "Content-Length": String(fileData.length),
      },
      body: fileData,
    },
  );
  if (!res.ok)
    throw new Error(`GCS upload failed ${res.status}: ${await res.text()}`);
  return `gs://${bucket}/${objectName}`;
}

/** Delete object from GCS */
async function deleteFromGCS(
  bucket: string,
  objectName: string,
): Promise<void> {
  const token = await getAccessToken();
  await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  ).catch(() => {});
}

/** Ensure GCS bucket exists, create if not */
async function ensureBucket(bucket: string, projectId: string): Promise<void> {
  const token = await getAccessToken();
  const checkRes = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (checkRes.ok) return;
  if (checkRes.status === 404 || checkRes.status === 403) {
    // Try to create
    const createRes = await fetch(
      `https://storage.googleapis.com/storage/v1/b?project=${projectId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: bucket,
          location: "US",
          lifecycle: {
            rule: [{ action: { type: "Delete" }, condition: { age: 1 } }],
          },
        }),
      },
    );
    if (createRes.ok) {
      console.log(`  [Chirp] Created GCS bucket: ${bucket}`);
      return;
    }
    throw new Error(
      `GCS bucket "${bucket}" not accessible and cannot be created.\n` +
        `  Grant "Storage Admin" role to the service account, or create the bucket manually\n` +
        `  and set GOOGLE_CLOUD_BUCKET in .env.`,
    );
  }
}

export const googleChirp: TranscriptionProvider = {
  name: "google-chirp",

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const locale = LANG_MAP[lang] || `${lang}-${lang.toUpperCase()}`;
    const projectId = getProjectId();
    const bucket =
      process.env.GOOGLE_CLOUD_BUCKET || `${projectId}-speech-eval`;

    // Get local audio file
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Chirp"));

    try {
      // Convert mp4 to FLAC for Chirp (mp4 container not supported)
      const flacPath = path.join(os.tmpdir(), `eval-chirp-${Date.now()}.flac`);
      console.log(`  [Chirp] Converting audio to FLAC...`);
      execSync(`ffmpeg -y -i "${filePath}" -ac 1 -ar 16000 "${flacPath}"`, {
        stdio: "pipe",
      });
      const flacSizeMB = fs.statSync(flacPath).size / (1024 * 1024);

      // Ensure bucket exists and upload audio
      await ensureBucket(bucket, projectId);
      const objectName = `eval-${Date.now()}.flac`;
      console.log(
        `  [Chirp] Uploading to GCS (${flacSizeMB.toFixed(1)} MB FLAC)...`,
      );
      const gcsUri = await uploadToGCS(flacPath, bucket, objectName);
      fs.unlinkSync(flacPath);

      // Submit BatchRecognize via Speech V2 API
      const token = await getAccessToken();
      const recognizer = `projects/${projectId}/locations/${LOCATION}/recognizers/_`;

      console.log(
        `  [Chirp] Submitting batch recognize (${locale}, chirp_3)...`,
      );

      // Try with diarization first; some languages don't support it
      let batchRes: Response | null = null;
      for (const useDiarization of [true, false]) {
        const features: Record<string, any> = {};
        if (useDiarization) features.diarizationConfig = {};

        batchRes = await fetch(
          `https://${LOCATION}-speech.googleapis.com/v2/${recognizer}:batchRecognize`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              config: {
                explicitDecodingConfig: {
                  encoding: "FLAC",
                  sampleRateHertz: 16000,
                  audioChannelCount: 1,
                },
                languageCodes: [locale],
                model: "chirp_3",
                features,
              },
              files: [{ uri: gcsUri }],
              recognitionOutputConfig: {
                inlineResponseConfig: {},
              },
              processingStrategy: "DYNAMIC_BATCHING",
            }),
          },
        );

        if (batchRes.ok) break;

        const errText = await batchRes.text();
        if (useDiarization && errText.includes("diarization")) {
          console.log(
            `  [Chirp] Diarization not supported for ${locale}, retrying without...`,
          );
          continue;
        }
        await deleteFromGCS(bucket, objectName);
        throw new Error(
          `Chirp BatchRecognize failed ${batchRes.status}: ${errText}`,
        );
      }

      if (!batchRes || !batchRes.ok) {
        await deleteFromGCS(bucket, objectName);
        throw new Error("Chirp BatchRecognize failed unexpectedly");
      }

      const operation = (await batchRes.json()) as { name: string };
      console.log(`  [Chirp] Operation: ${operation.name}`);
      const result = await pollOperation(operation.name);

      // Clean up GCS
      await deleteFromGCS(bucket, objectName);

      // Parse results — BatchRecognize inline response
      const resultKeys = Object.keys(result?.results || {});
      const inlineResult = result?.results?.[resultKeys[0]];
      const transcript = inlineResult?.transcript;

      if (!transcript?.results) {
        throw new Error(
          `Chirp returned no results: ${JSON.stringify(result).slice(0, 500)}`,
        );
      }

      // Build utterances from results with word-level info
      const utterances: NormalizedTranscript["utterances"] = [];
      const textParts: string[] = [];

      for (const r of transcript.results as any[]) {
        if (!r.alternatives?.[0]) continue;
        const alt = r.alternatives[0];
        const text: string = alt.transcript || "";
        if (!text.trim()) continue;

        textParts.push(text);

        // Extract speaker from word-level info if available
        const speaker = alt.words?.[0]?.speakerLabel || "A";
        const startMs =
          parseFloat(alt.words?.[0]?.startOffset?.replace("s", "") || "0") *
          1000;
        const endMs =
          parseFloat(
            alt.words?.[alt.words.length - 1]?.endOffset?.replace("s", "") ||
              "0",
          ) * 1000;

        const last = utterances[utterances.length - 1];
        if (last && last.speaker === speaker) {
          last.end = endMs;
          last.text += " " + text;
        } else {
          utterances.push({ speaker, start: startMs, end: endMs, text });
        }
      }

      const fullText = textParts.join(" ").trim();
      const durationMs =
        utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

      console.log(
        `  [Chirp] Transcription: ${fullText.length} chars, ${utterances.length} utterances`,
      );

      return {
        provider: "google-chirp",
        language: lang,
        fullText,
        utterances,
        durationMs,
        raw: result,
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
