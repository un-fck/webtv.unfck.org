import { randomUUID } from "crypto";

const ts = () => new Date().toTimeString().slice(0, 8);
const plog = (...args: unknown[]) => console.log(`[${ts()}]`, ...args);
const perr = (...args: unknown[]) => console.error(`[${ts()}]`, ...args);
import {
  saveTranscript,
  deleteTranscriptsForEntry,
  getTranscriptById,
  updateTranscriptStatus,
  tryAcquirePipelineLock,
  releasePipelineLock,
  type TranscriptStatus,
  type TranscriptContent,
  type RawParagraph,
} from "./turso";
import { identifySpeakers } from "./speaker-identification";
import type { SpeakerMapping } from "./speakers";
import {
  trackGeminiTranscription,
  UsageOperations,
  UsageStages,
} from "./usage-tracking";
import { bcp47ToKalturaName } from "./languages";
import type { GeminiTranscriptionOptions } from "./gemini-transcription";
import { setSpeakerMapping } from "./speakers";
import { getSTTProvider } from "./providers/config";
import { getRichResult } from "./providers/gemini-production";
import { toRawParagraphs } from "./providers/convert";
import type { GeminiTranscriptionResult } from "./gemini-transcription";

export { type TranscriptStatus } from "./turso";

export interface PollResult {
  stage: TranscriptStatus;
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
          widgetId: "_2503451",
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
        partnerId: 2503451,
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
  return `https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/${entryId}/format/download/protocol/https/flavorParamIds/${flavorParamId}`;
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

  if (transcript.status === "completed") {
    return {
      stage: "completed",
      raw_paragraphs: transcript.content.raw_paragraphs,
      statements: transcript.content.statements,
      topics: transcript.content.topics,
      propositions: transcript.content.propositions,
    };
  }

  if (transcript.status === "error") {
    return {
      stage: "error",
      error_message: transcript.error_message || "Unknown error",
      raw_paragraphs: transcript.content.raw_paragraphs,
      statements: transcript.content.statements,
      topics: transcript.content.topics,
      propositions: transcript.content.propositions,
    };
  }

  if (
    transcript.status === "identifying_speakers" ||
    transcript.status === "analyzing_topics" ||
    transcript.status === "analyzing_propositions"
  ) {
    // Try to restart stuck stages by re-acquiring a stale lock
    const paragraphs = transcript.content.raw_paragraphs;
    if (paragraphs && paragraphs.length > 0) {
      const acquired = await tryAcquirePipelineLock(transcriptId);
      if (acquired) {
        plog(`[Pipeline] Re-entering stuck stage ${transcript.status} for ${transcriptId}`);
        runAnalysisPipeline(transcriptId, paragraphs, undefined).catch(
          (err) => {
            perr("[Pipeline] Re-entry error:", err);
            updateTranscriptStatus(
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
      stage: transcript.status,
      raw_paragraphs: transcript.content.raw_paragraphs,
      statements: transcript.content.statements,
      topics: transcript.content.topics,
      propositions: transcript.content.propositions,
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
): Promise<void> {
  try {
    const provider = getSTTProvider();
    await updateTranscriptStatus(transcriptId, "transcribing");
    plog(`[Pipeline] Starting transcription with ${provider.name} for ${transcriptId}`);

    const start = Date.now();
    const transcript = await provider.transcribe(audioUrl, {
      language: languageCode,
    });
    const durationMs = Date.now() - start;

    let paragraphs: RawParagraph[];
    let speakerMapping: SpeakerMapping | undefined;

    if (provider.capabilities.speakerIdentification) {
      // Rich provider (e.g. production Gemini) — extract full result
      const richResult = getRichResult();
      if (richResult) {
        paragraphs = richResult.paragraphs;
        speakerMapping = richResult.speakerMapping;
      } else {
        // Fallback: convert normalized transcript
        paragraphs = toRawParagraphs(transcript);
      }

      // Track Gemini-specific usage if available
      const rawResult = transcript.raw as GeminiTranscriptionResult | undefined;
      if (rawResult?.usageMetadata) {
        await trackGeminiTranscription({
          transcriptId,
          stage: UsageStages.transcribing,
          operation: UsageOperations.geminiTranscribe,
          model: "gemini-3-flash-preview",
          usageMetadata: rawResult.usageMetadata,
          audioSeconds: rawResult.audioSeconds,
          durationMs,
          requestMeta: {
            provider: provider.name,
            chunked: rawResult.chunked,
            chunkCount: rawResult.chunkCount,
            withThinking: options.withThinking ?? false,
            paragraph_count: paragraphs.length,
          },
        });
      }
    } else {
      // Basic STT provider — convert to RawParagraphs, no speaker mapping
      paragraphs = toRawParagraphs(transcript);
    }

    plog(`[Pipeline] Transcription complete: ${paragraphs.length} segments (${provider.name}, ${durationMs}ms)`);

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
    );
    if (speakerMapping) {
      await setSpeakerMapping(transcriptId, speakerMapping);
    }

    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (acquired) {
      // Pass speakerMapping as prebuiltMapping for rich providers;
      // undefined for basic providers triggers full OpenAI speaker ID
      runAnalysisPipeline(
        transcriptId,
        paragraphs,
        speakerMapping,
      ).catch((err) => {
        perr("[Pipeline] Analysis error:", err);
        updateTranscriptStatus(
          transcriptId,
          "error",
          err instanceof Error ? err.message : "Analysis failed",
        );
        releasePipelineLock(transcriptId);
      });
    }
  } catch (err) {
    perr("[Pipeline] Error:", err);
    await updateTranscriptStatus(
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
    await updateTranscriptStatus(transcriptId, "identifying_speakers");
    await identifySpeakers(paragraphs, transcriptId, speakerMapping, { skipPropositions: true });
    await updateTranscriptStatus(transcriptId, "completed");
    await releasePipelineLock(transcriptId);
  } catch (err) {
    await updateTranscriptStatus(
      transcriptId,
      "error",
      err instanceof Error ? err.message : "Analysis pipeline failed",
    );
    await releasePipelineLock(transcriptId);
    throw err;
  }
}

/**
 * Submit a Gemini transcription job and return immediately.
 * The transcription + analysis runs in the background; clients poll via pollTranscription().
 */
export async function submitTranscription(
  kalturaId: string,
  options: GeminiTranscriptionOptions & { force?: boolean; existingTranscriptId?: string } = {},
): Promise<{ entryId: string; transcriptId: string }> {
  const lang = options.language || "en";
  const kalturaLang = bcp47ToKalturaName(lang);
  const { entryId, audioUrl } = await getKalturaAudioUrl(
    kalturaId,
    kalturaLang,
  );

  if (options.force) {
    await deleteTranscriptsForEntry(entryId, lang);
  }

  const provider = getSTTProvider();
  const transcriptId = options.existingTranscriptId ?? `${provider.name}-${randomUUID()}`;

  await saveTranscript(entryId, transcriptId, null, null, audioUrl, "transcribing", lang, {
    statements: [],
    topics: {},
  });

  runTranscriptionPipeline(transcriptId, entryId, audioUrl, options, lang).catch((err) => {
    perr("[Pipeline] Unhandled error:", err);
  });

  return { entryId, transcriptId };
}
