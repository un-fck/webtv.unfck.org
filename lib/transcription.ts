import { randomUUID } from "crypto";

const ts = () => new Date().toTimeString().slice(0, 8);
const plog = (...args: unknown[]) => console.log(`[${ts()}]`, ...args);
const perr = (...args: unknown[]) => console.error(`[${ts()}]`, ...args);
import {
  saveTranscript,
  deleteTranscriptsForEntry,
  getTranscriptById,
  getActiveTranscriptByKalturaId,
  updateTranscriptionStatus,
  tryAcquirePipelineLock,
  releasePipelineLock,
  withVideoLock,
  type TranscriptionStatus,
  type AnalysisStatus,
  type TranscriptContent,
  type RawParagraph,
} from "./db";
import { identifySpeakers } from "./pipeline";
import type { SpeakerMapping } from "./speakers";
import {
  trackTranscription,
  trackTranscriptionError,
} from "./usage-tracking";
import { bcp47ToKalturaName } from "./languages";
import type { GeminiTranscriptionOptions } from "./gemini-transcription";
import { setSpeakerMapping } from "./speakers";
import { KALTURA_PARTNER_ID, KALTURA_WIDGET_ID } from "./kaltura";
import { getSTTProvider } from "./providers/config";
import { toRawParagraphs } from "./providers/convert";
import { applyTimeOffset } from "./transcript-offset";
import type { GeminiTranscriptionResult } from "./gemini-transcription";

export { type TranscriptionStatus } from "./db";

export interface PollResult {
  stage: TranscriptionStatus;
  analysis_status?: AnalysisStatus;
  raw_paragraphs?: RawParagraph[];
  statements?: TranscriptContent["statements"];
  topics?: TranscriptContent["topics"];
  propositions?: TranscriptContent["propositions"];
  error_message?: string;
}

async function fetchKalturaFlavors(kalturaId: string) {
  const apiResponse = await fetch(
    "https://cdnapisec.kaltura.com/api_v3/service/multirequest",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "1": {
          service: "session",
          action: "startWidgetSession",
          widgetId: KALTURA_WIDGET_ID,
        },
        "2": {
          service: "baseEntry",
          action: "list",
          ks: "{1:result:ks}",
          filter: { redirectFromEntryId: kalturaId },
          responseProfile: { type: 1, fields: "id,duration,objectType" },
        },
        "3": {
          service: "flavorAsset",
          action: "list",
          ks: "{1:result:ks}",
          filter: { entryIdEqual: "{2:result:objects:0:id}" },
        },
        apiVersion: "3.3.0",
        format: 1,
        ks: "",
        clientTag: "html5:v3.17.30",
        partnerId: KALTURA_PARTNER_ID,
      }),
    },
  );

  if (!apiResponse.ok) throw new Error("Failed to query Kaltura API");

  const apiData = await apiResponse.json();
  const entryId = apiData[1]?.objects?.[0]?.id;
  if (!entryId) throw new Error("No entry found");

  const flavors = apiData[2]?.objects || [];
  const isLiveStream =
    apiData[1]?.objects?.[0]?.objectType === "KalturaLiveStreamEntry";

  return { entryId, flavors, isLiveStream };
}

function buildAudioUrl(entryId: string, flavorParamId: number) {
  return `https://cdnapisec.kaltura.com/p/${KALTURA_PARTNER_ID}/sp/0/playManifest/entryId/${entryId}/format/download/protocol/https/flavorParamIds/${flavorParamId}`;
}

export async function getKalturaAudioUrl(
  kalturaId: string,
  language = "english",
) {
  const { entryId, flavors, isLiveStream } =
    await fetchKalturaFlavors(kalturaId);

  const candidates = flavors.filter(
    (f: { language?: string; tags?: string }) =>
      f.language?.toLowerCase() === language.toLowerCase() &&
      f.tags?.includes("audio_only"),
  );
  const preferredFlavor =
    candidates.find(
      (f: { status?: number; isDefault?: boolean }) =>
        f.status === 2 && f.isDefault,
    ) ||
    candidates.find((f: { status?: number }) => f.status === 2) ||
    candidates[0];
  const flavorParamId = preferredFlavor?.flavorParamsId || 100;

  return {
    entryId,
    audioUrl: buildAudioUrl(entryId, flavorParamId),
    flavorParamId,
    isLiveStream,
  };
}

export async function getAvailableAudioLanguages(kalturaId: string) {
  const { entryId, flavors } = await fetchKalturaFlavors(kalturaId);

  const audioFlavors = flavors.filter(
    (f: { tags?: string; status?: number }) =>
      f.tags?.includes("audio_only") && f.status === 2,
  );

  const languages = [
    ...new Set(
      audioFlavors
        .map((f: { language?: string }) => f.language?.toLowerCase())
        .filter(Boolean) as string[],
    ),
  ];

  return {
    entryId,
    languages: languages.map((lang) => {
      const flavor = audioFlavors.find(
        (f: { language?: string }) => f.language?.toLowerCase() === lang,
      );
      return {
        language: lang,
        flavorParamId: flavor?.flavorParamsId as number,
        audioUrl: buildAudioUrl(entryId, flavor?.flavorParamsId as number),
      };
    }),
  };
}

export async function pollTranscription(
  transcriptId: string,
): Promise<PollResult> {
  const transcript = await getTranscriptById(transcriptId);
  if (!transcript) throw new Error("Transcript not found");

  // Realignment offset (WebTV re-cut the audio after transcription) is applied
  // here at the serving boundary; downstream consumers see aligned timestamps.
  const content = applyTimeOffset(
    transcript.content,
    transcript.time_offset_ms,
  );

  if (transcript.transcription_status === "completed") {
    return {
      stage: "completed",
      analysis_status: transcript.analysis_status,
      raw_paragraphs: content.raw_paragraphs,
      statements: content.statements,
      topics: content.topics,
      propositions: content.propositions,
    };
  }

  if (transcript.transcription_status === "error") {
    return {
      stage: "error",
      analysis_status: transcript.analysis_status,
      error_message: transcript.error_message || "Unknown error",
      raw_paragraphs: content.raw_paragraphs,
      statements: content.statements,
      topics: content.topics,
      propositions: content.propositions,
    };
  }

  if (
    transcript.transcription_status === "identifying_speakers" ||
    transcript.transcription_status === "analyzing_topics"
  ) {
    // Try to restart stuck stages by re-acquiring a stale lock (use raw,
    // unshifted paragraphs — these feed re-processing, not display).
    const paragraphs = transcript.content.raw_paragraphs;
    if (paragraphs && paragraphs.length > 0) {
      const acquired = await tryAcquirePipelineLock(transcriptId);
      if (acquired) {
        plog(
          `[Pipeline] Re-entering stuck stage ${transcript.transcription_status} for ${transcriptId}`,
        );
        runAnalysisPipeline(transcriptId, paragraphs, undefined).catch(
          (err) => {
            perr("[Pipeline] Re-entry error:", err);
            updateTranscriptionStatus(
              transcriptId,
              "error",
              err instanceof Error ? err.message : "Re-entry failed",
            );
            releasePipelineLock(transcriptId);
          },
        );
      }
    }

    return {
      stage: transcript.transcription_status,
      analysis_status: transcript.analysis_status,
      raw_paragraphs: content.raw_paragraphs,
      statements: content.statements,
      topics: content.topics,
      propositions: content.propositions,
    };
  }

  // Gemini transcripts run fully in-process — nothing to poll externally
  return { stage: "transcribing" };
}

// ---- Provider-agnostic transcription pipeline ----

async function runTranscriptionPipeline(
  transcriptId: string,
  entryId: string,
  audioUrl: string,
  options: GeminiTranscriptionOptions,
  languageCode: string,
  kalturaId: string,
): Promise<void> {
  try {
    const provider = getSTTProvider(languageCode);
    await updateTranscriptionStatus(transcriptId, "transcribing");
    plog(
      `[Pipeline] Starting transcription with ${provider.name} for ${transcriptId}`,
    );

    const start = Date.now();
    let transcript;
    try {
      transcript = await provider.transcribe(audioUrl, {
        language: languageCode,
      });
    } catch (err) {
      await trackTranscriptionError({
        transcriptId,
        provider,
        durationMs: Date.now() - start,
        error: err,
        requestMeta: { language: languageCode },
      });
      throw err;
    }
    const durationMs = Date.now() - start;

    const paragraphs: RawParagraph[] = toRawParagraphs(transcript);
    const speakerMapping: SpeakerMapping | undefined = undefined;

    const rawResult = transcript.raw as GeminiTranscriptionResult | undefined;
    await trackTranscription({
      transcriptId,
      provider,
      usage: transcript.usage,
      durationMs,
      requestMeta: {
        // Gemini-only fields are harmless on other providers (undefined).
        chunked: rawResult?.chunked,
        chunkCount: rawResult?.chunkCount,
        withThinking: options.withThinking ?? false,
        paragraph_count: paragraphs.length,
      },
    });

    plog(
      `[Pipeline] Transcription complete: ${paragraphs.length} segments (${provider.name}, ${durationMs}ms)`,
    );

    const content: TranscriptContent = {
      raw_paragraphs: paragraphs,
      statements: [],
      topics: {},
    };
    await saveTranscript(
      entryId,
      transcriptId,
      null,
      null,
      audioUrl,
      "identifying_speakers",
      languageCode,
      content,
      kalturaId,
      // Audio length we just transcribed — frozen baseline for re-cut detection.
      transcript.durationMs != null ? Math.round(transcript.durationMs) : null,
    );
    if (speakerMapping) {
      await setSpeakerMapping(transcriptId, speakerMapping);
    }

    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (acquired) {
      // Pass speakerMapping as prebuiltMapping for rich providers;
      // undefined for basic providers triggers full OpenAI speaker ID
      runAnalysisPipeline(transcriptId, paragraphs, speakerMapping).catch(
        (err) => {
          perr("[Pipeline] Analysis error:", err);
          updateTranscriptionStatus(
            transcriptId,
            "error",
            err instanceof Error ? err.message : "Analysis failed",
          );
          releasePipelineLock(transcriptId);
        },
      );
    }
  } catch (err) {
    perr("[Pipeline] Error:", err);
    await updateTranscriptionStatus(
      transcriptId,
      "error",
      err instanceof Error ? err.message : "Transcription failed",
    );
    throw err;
  }
}

async function runAnalysisPipeline(
  transcriptId: string,
  paragraphs: RawParagraph[],
  speakerMapping?: SpeakerMapping,
): Promise<void> {
  try {
    await updateTranscriptionStatus(transcriptId, "identifying_speakers");
    await identifySpeakers(paragraphs, transcriptId, speakerMapping);
    await updateTranscriptionStatus(transcriptId, "completed");
    await releasePipelineLock(transcriptId);
  } catch (err) {
    await updateTranscriptionStatus(
      transcriptId,
      "error",
      err instanceof Error ? err.message : "Analysis pipeline failed",
    );
    await releasePipelineLock(transcriptId);
    throw err;
  }
}

export type SpeakerIdentificationResult =
  | {
      ok: true;
      mapping: SpeakerMapping;
      statements: TranscriptContent["statements"];
      topics: TranscriptContent["topics"];
    }
  | {
      ok: false;
      code: "not_found" | "missing_data" | "pipeline_locked";
      message: string;
    };

/**
 * Run speaker identification + the analysis pipeline for an existing transcript,
 * in-process. Called from `runTranscriptionPipeline` (and indirectly from the
 * `pollTranscription` stuck-stage recovery path) — no HTTP self-call, so it
 * works regardless of `NEXT_PUBLIC_BASE_URL` and avoids the extra round trip.
 */
export async function runSpeakerIdentification(
  transcriptId: string,
): Promise<SpeakerIdentificationResult> {
  const transcript = await getTranscriptById(transcriptId);
  if (!transcript) {
    return { ok: false, code: "not_found", message: "Transcript not found" };
  }

  const paragraphs = transcript.content.raw_paragraphs;
  if (!paragraphs || paragraphs.length === 0) {
    return {
      ok: false,
      code: "missing_data",
      message: "No raw paragraphs available",
    };
  }

  const acquired = await tryAcquirePipelineLock(transcriptId);
  if (!acquired) {
    return {
      ok: false,
      code: "pipeline_locked",
      message: "Pipeline already running",
    };
  }

  try {
    await updateTranscriptionStatus(transcriptId, "identifying_speakers");
    const mapping = await identifySpeakers(paragraphs, transcriptId, undefined);
    await updateTranscriptionStatus(transcriptId, "completed");
    await releasePipelineLock(transcriptId);

    const updated = await getTranscriptById(transcriptId);
    return {
      ok: true,
      mapping,
      statements: updated?.content.statements || [],
      topics: updated?.content.topics || {},
    };
  } catch (error) {
    await updateTranscriptionStatus(
      transcriptId,
      "error",
      error instanceof Error ? error.message : "Pipeline failed",
    );
    await releasePipelineLock(transcriptId);
    throw error;
  }
}

/**
 * Submit a Gemini transcription job and return immediately.
 * The transcription + analysis runs in the background; clients poll via pollTranscription().
 */
export async function submitTranscription(
  kalturaId: string,
  options: GeminiTranscriptionOptions & {
    force?: boolean;
    existingTranscriptId?: string;
    /**
     * How to run the long-lived pipeline relative to the caller. In a
     * serverless request/cron handler this MUST be Next's `after()`, otherwise
     * Vercel may freeze/kill the function once the response is sent and the
     * pipeline dies mid-flight. In a standalone Node script, leave it undefined:
     * the default detaches the promise, which survives because the process
     * stays alive (e.g. while `pollTranscription` awaits).
     */
    schedule?: (work: () => void) => void;
    /**
     * User who initiated this transcript (tracking only; daily limits are
     * counter-based, not ownership-based). null/omitted for script runs.
     */
    createdBy?: string | null;
  } = {},
): Promise<{
  entryId: string;
  transcriptId: string;
  stage: TranscriptionStatus;
  started: boolean;
}> {
  const lang = options.language || "en";
  const kalturaLang = bcp47ToKalturaName(lang);
  const { entryId, audioUrl } = await getKalturaAudioUrl(
    kalturaId,
    kalturaLang,
  );

  if (options.force) {
    await deleteTranscriptsForEntry(entryId, lang);
  }

  const provider = getSTTProvider(lang);

  // Serialize the start decision per video+language so two simultaneous
  // requests can't each create a fresh transcript row. Reuse an existing
  // in-progress/completed transcript instead of starting a duplicate — unless
  // forcing, or resuming a specific (scheduled) row by id.
  const result = await withVideoLock(kalturaId, lang, async (client) => {
    if (!options.force && !options.existingTranscriptId) {
      const existing = await getActiveTranscriptByKalturaId(
        kalturaId,
        lang,
        client,
      );
      if (existing) {
        return {
          transcriptId: existing.transcript_id,
          stage: existing.transcription_status,
          started: false,
        };
      }
    }
    const transcriptId =
      options.existingTranscriptId ?? `${provider.name}-${randomUUID()}`;
    await saveTranscript(
      entryId,
      transcriptId,
      null,
      null,
      audioUrl,
      "transcribing",
      lang,
      { statements: [], topics: {} },
      kalturaId,
      null, // source_duration_ms unknown until transcription completes
      client,
      options.createdBy ?? null,
    );
    return {
      transcriptId,
      stage: "transcribing" as TranscriptionStatus,
      started: true,
    };
  });

  if (result.started) {
    const runPipeline = () => {
      runTranscriptionPipeline(
        result.transcriptId,
        entryId,
        audioUrl,
        options,
        lang,
        kalturaId,
      ).catch((err) => {
        perr("[Pipeline] Unhandled error:", err);
      });
    };
    // In serverless contexts the caller passes `after` so the work is tied to
    // the function's keep-alive window instead of a dangling promise. Scripts
    // omit it and rely on the live process.
    if (options.schedule) options.schedule(runPipeline);
    else runPipeline();
  }

  return {
    entryId,
    transcriptId: result.transcriptId,
    stage: result.stage,
    started: result.started,
  };
}
