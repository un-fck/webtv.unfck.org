import type { TranscriptionProvider, NormalizedTranscript } from "./types";

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY!;
const AZURE_SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT!;

// Map ISO 639-1 codes to BCP-47 locales for Azure Speech
const LANG_MAP: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  ar: "ar-SA",
  zh: "zh-CN",
  ru: "ru-RU",
};

export const azureSpeech: TranscriptionProvider = {
  name: "azure-speech",

  async transcribe(audioUrl, opts) {
    const locale = opts?.language
      ? LANG_MAP[opts.language] || opts.language
      : "en-US";
    const baseUrl = AZURE_SPEECH_ENDPOINT.replace(/\/$/, "");
    const apiBase = `${baseUrl}/speechtotext/v3.2/transcriptions`;
    const subKey = { "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY };

    // Submit batch transcription job
    const submitRes = await fetch(apiBase, {
      method: "POST",
      headers: { ...subKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentUrls: [audioUrl],
        locale,
        displayName: `eval-${Date.now()}`,
        properties: {
          wordLevelTimestampsEnabled: true,
          diarizationEnabled: true,
        },
      }),
    });
    if (!submitRes.ok) {
      throw new Error(
        `Azure Speech submit failed ${submitRes.status}: ${await submitRes.text()}`,
      );
    }
    const job = (await submitRes.json()) as { self: string; status: string };
    const jobUrl = job.self;

    // Poll until Succeeded or Failed
    let jobStatus: any;
    for (let i = 0; ; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetch(jobUrl, { headers: subKey });
      jobStatus = await pollRes.json();
      if (jobStatus.status === "Succeeded") break;
      if (jobStatus.status === "Failed") {
        throw new Error(
          `Azure Speech job failed: ${JSON.stringify(jobStatus.properties?.error)}`,
        );
      }
      if (i % 12 === 11)
        console.log(`  [Azure Speech] Still processing... (${(i + 1) * 5}s)`);
    }

    // Get result files
    const filesRes = await fetch(`${jobUrl}/files`, { headers: subKey });
    const filesJson = (await filesRes.json()) as {
      values: Array<{ kind: string; links: { contentUrl: string } }>;
    };
    const resultFile = filesJson.values.find((f) => f.kind === "Transcription");
    if (!resultFile) throw new Error("No transcription result file found");

    // Download result JSON
    const resultJson = (await (
      await fetch(resultFile.links.contentUrl)
    ).json()) as any;

    // Full text from combinedRecognizedPhrases
    const fullText = ((resultJson.combinedRecognizedPhrases || []) as any[])
      .map((p: any) => p.display || "")
      .join(" ")
      .trim();

    // Build utterances from recognizedPhrases with diarization
    const utterances: NormalizedTranscript["utterances"] = [];
    for (const phrase of (resultJson.recognizedPhrases || []) as any[]) {
      const best = phrase.nBest?.[0];
      if (!best) continue;
      const text: string = best.display || best.lexical || "";
      const speaker = phrase.speaker?.toString() || "A";
      // offsetInTicks / durationInTicks are in 100-nanosecond units
      const startMs = (phrase.offsetInTicks || 0) / 10000;
      const durationMs = (phrase.durationInTicks || 0) / 10000;
      const endMs = startMs + durationMs;

      const last = utterances[utterances.length - 1];
      if (last && last.speaker === speaker) {
        last.end = endMs;
        last.text += " " + text;
      } else {
        utterances.push({ speaker, start: startMs, end: endMs, text });
      }
    }

    const totalDurationMs =
      utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

    // Clean up job to avoid cluttering the Azure workspace
    await fetch(jobUrl, { method: "DELETE", headers: subKey });

    return {
      provider: "azure-speech",
      language: opts?.language || "en",
      fullText,
      utterances,
      durationMs: totalDurationMs,
      raw: resultJson,
    } satisfies NormalizedTranscript;
  },
};
