import { AzureOpenAI } from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions/completions";

import {
  ASSEMBLYAI_BASE_RATE_PER_HOUR_USD,
  ASSEMBLYAI_FEATURE_RATES_PER_HOUR_USD,
  ASSEMBLYAI_RATE_CARD_VERSION,
} from "./config";
import { insertProcessingUsageEvent } from "./turso";

export const UsageStages = {
  transcribing: "transcribing",
  identifyingSpeakers: "identifying_speakers",
  resegmenting: "resegmenting",
  analyzingTopics: "analyzing_topics",
  taggingSentences: "tagging_sentences",
  analyzingPropositions: "analyzing_propositions",
} as const;

export const UsageOperations = {
  openaiInitialSpeakerMapping: "openai_initial_speaker_mapping",
  openaiResegmentParagraph: "openai_resegment_paragraph",
  openaiDefineTopics: "openai_define_topics",
  openaiTagParagraphTopics: "openai_tag_paragraph_topics",
  openaiTagSentenceTopics: "openai_tag_sentence_topics",
  openaiAnalyzePropositions: "openai_analyze_propositions",
  assemblySubmit: "assembly_submit_transcription",
  assemblyPoll: "assembly_poll_transcription",
  assemblyFetchParagraphs: "assembly_fetch_paragraphs",
} as const;

function safeJsonStringify(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function safeInsertUsageEvent(
  event: Parameters<typeof insertProcessingUsageEvent>[0],
): Promise<void> {
  try {
    await insertProcessingUsageEvent(event);
  } catch (error) {
    console.warn(
      "Failed to persist usage event:",
      error instanceof Error ? error.message : error,
    );
  }
}

function parseAssemblyRequestBody(
  init?: RequestInit,
): Record<string, unknown> | null {
  if (!init?.body || typeof init.body !== "string") return null;
  try {
    const parsed = JSON.parse(init.body);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function sumEnabledFeatureRates(
  payload: Record<string, unknown> | null,
): number {
  if (!payload) return 0;
  return Object.entries(ASSEMBLYAI_FEATURE_RATES_PER_HOUR_USD).reduce(
    (sum, [featureKey, rate]) => {
      return payload[featureKey] ? sum + rate : sum;
    },
    0,
  );
}

function getAssemblyUsageMetrics(
  body: unknown,
  requestPayload: Record<string, unknown> | null,
): {
  usageSeconds: number | null;
  usageMultiplier: number | null;
  usageHours: number | null;
  usageQuantityType: string | null;
  baseRatePerHourUsd: number | null;
  featureRatePerHourUsd: number | null;
  pricingMeta: Record<string, unknown> | null;
} {
  if (!body || typeof body !== "object") {
    return {
      usageSeconds: null,
      usageMultiplier: null,
      usageHours: null,
      usageQuantityType: null,
      baseRatePerHourUsd: null,
      featureRatePerHourUsd: null,
      pricingMeta: null,
    };
  }

  const bodyRecord = body as Record<string, unknown>;
  const status =
    typeof bodyRecord.status === "string" ? bodyRecord.status : null;
  const audioDuration =
    typeof bodyRecord.audio_duration === "number"
      ? bodyRecord.audio_duration
      : null;

  if (status !== "completed" || audioDuration === null) {
    return {
      usageSeconds: null,
      usageMultiplier: null,
      usageHours: null,
      usageQuantityType: null,
      baseRatePerHourUsd: null,
      featureRatePerHourUsd: null,
      pricingMeta: null,
    };
  }

  const channels =
    typeof bodyRecord.audio_channels === "number" &&
    bodyRecord.audio_channels > 0
      ? bodyRecord.audio_channels
      : 1;
  const usageHours = (audioDuration * channels) / 3600;
  const featureRatePerHourUsd = sumEnabledFeatureRates(requestPayload);

  return {
    usageSeconds: audioDuration,
    usageMultiplier: channels,
    usageHours,
    usageQuantityType: "audio_hours",
    baseRatePerHourUsd: ASSEMBLYAI_BASE_RATE_PER_HOUR_USD,
    featureRatePerHourUsd,
    pricingMeta: {
      transcript_status: status,
      audio_channels: channels,
      request_feature_flags: requestPayload,
    },
  };
}

async function safeReadJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

interface OpenAITrackedCallArgs {
  client: AzureOpenAI;
  transcriptId?: string;
  stage: string;
  operation: string;
  model: string;
  request: ChatCompletionCreateParamsNonStreaming;
  requestMeta?: Record<string, unknown>;
}

export async function trackOpenAIChatCompletion({
  client,
  transcriptId,
  stage,
  operation,
  model,
  request,
  requestMeta,
}: OpenAITrackedCallArgs): Promise<ChatCompletion> {
  const start = Date.now();
  try {
    const completion: ChatCompletion =
      await client.chat.completions.create(request);
    const durationMs = Date.now() - start;
    const usage = completion.usage;

    await safeInsertUsageEvent({
      transcript_id: transcriptId ?? "unknown",
      provider: "openai",
      stage,
      operation,
      status: "success",
      model,
      input_tokens: usage?.prompt_tokens ?? null,
      output_tokens: usage?.completion_tokens ?? null,
      reasoning_tokens:
        usage?.completion_tokens_details?.reasoning_tokens ?? null,
      cached_input_tokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      duration_ms: durationMs,
      request_meta: safeJsonStringify(requestMeta),
    });

    return completion;
  } catch (error) {
    const durationMs = Date.now() - start;
    await safeInsertUsageEvent({
      transcript_id: transcriptId ?? "unknown",
      provider: "openai",
      stage,
      operation,
      status: "error",
      model,
      duration_ms: durationMs,
      request_meta: safeJsonStringify(requestMeta),
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

interface AssemblyTrackedFetchArgs {
  transcriptId?: string;
  stage: string;
  operation: string;
  url: string;
  init?: RequestInit;
  requestMeta?: Record<string, unknown>;
  resolveTranscriptId?: (responseJson: unknown) => string | null;
}

export async function trackAssemblyAIFetch({
  transcriptId,
  stage,
  operation,
  url,
  init,
  requestMeta,
  resolveTranscriptId,
}: AssemblyTrackedFetchArgs): Promise<Response> {
  const start = Date.now();
  const requestPayload = parseAssemblyRequestBody(init);

  try {
    const response = await fetch(url, init);
    const durationMs = Date.now() - start;
    const responseJson = await safeReadJsonBody(response);

    const resolvedTranscriptId =
      transcriptId ?? resolveTranscriptId?.(responseJson) ?? "unknown";

    const usageMetrics = getAssemblyUsageMetrics(responseJson, requestPayload);

    await safeInsertUsageEvent({
      transcript_id: resolvedTranscriptId,
      provider: "assemblyai",
      stage,
      operation,
      status: response.ok ? "success" : "error",
      usage_hours: usageMetrics.usageHours,
      usage_seconds: usageMetrics.usageSeconds,
      usage_quantity_type: usageMetrics.usageQuantityType,
      usage_multiplier: usageMetrics.usageMultiplier,
      rate_card_version:
        usageMetrics.usageHours !== null ? ASSEMBLYAI_RATE_CARD_VERSION : null,
      base_rate_per_hour_usd: usageMetrics.baseRatePerHourUsd,
      feature_rate_per_hour_usd: usageMetrics.featureRatePerHourUsd,
      pricing_meta: safeJsonStringify(usageMetrics.pricingMeta),
      duration_ms: durationMs,
      request_meta: safeJsonStringify({
        ...requestMeta,
        url,
        http_status: response.status,
        http_ok: response.ok,
      }),
      error_message: response.ok
        ? null
        : `AssemblyAI request failed with status ${response.status}`,
    });

    return response;
  } catch (error) {
    const durationMs = Date.now() - start;
    await safeInsertUsageEvent({
      transcript_id: transcriptId ?? "unknown",
      provider: "assemblyai",
      stage,
      operation,
      status: "error",
      duration_ms: durationMs,
      request_meta: safeJsonStringify({ ...requestMeta, url }),
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
