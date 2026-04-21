import { AzureOpenAI } from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions/completions";

import {
  GEMINI_RATE_CARD_VERSION,
  GEMINI_MODEL_PRICING,
} from "./config";
import { insertProcessingUsageEvent } from "./turso";
import type { GeminiUsageMetadata } from "./gemini-transcription";

export const UsageStages = {
  transcribing: "transcribing",
  identifyingSpeakers: "identifying_speakers",
  resegmenting: "resegmenting",
  analyzingTopics: "analyzing_topics",
  taggingSentences: "tagging_sentences",
  analyzingPropositions: "analyzing_propositions",
  aligningPv: "aligning_pv",
} as const;

export const UsageOperations = {
  openaiInitialSpeakerMapping: "openai_initial_speaker_mapping",
  openaiResegmentParagraph: "openai_resegment_paragraph",
  openaiDefineTopics: "openai_define_topics",
  openaiTagSentenceTopics: "openai_tag_sentence_topics",
  openaiAnalyzePropositions: "openai_analyze_propositions",
  geminiTranscribe: "gemini_transcribe",
  geminiPvAlignment: "gemini_pv_alignment",
  openaiNormalizeSpeakers: "openai_normalize_speakers",
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
  const maxRetries = 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        cached_input_tokens:
          usage?.prompt_tokens_details?.cached_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        duration_ms: durationMs,
        request_meta: safeJsonStringify(requestMeta),
      });

      return completion;
    } catch (error) {
      const durationMs = Date.now() - start;
      // Retry on 429 rate limit errors
      const status = (error as { status?: number }).status;
      if (status === 429 && attempt < maxRetries) {
        const retryAfterMs =
          Number(
            (error as { headers?: Headers }).headers?.get("retry-after-ms"),
          ) || 1000 * 2 ** attempt;
        console.warn(
          `  ⏳ Rate limited, retrying in ${retryAfterMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, retryAfterMs));
        continue;
      }
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
  throw new Error("Unreachable");
}

interface GeminiTrackedCallArgs {
  transcriptId?: string;
  stage: string;
  operation: string;
  model: string;
  usageMetadata: GeminiUsageMetadata;
  /** Duration of the audio in seconds, used to populate usage_hours for cost comparison */
  audioSeconds?: number;
  durationMs: number;
  requestMeta?: Record<string, unknown>;
}

export async function trackGeminiTranscription({
  transcriptId,
  stage,
  operation,
  model,
  usageMetadata,
  audioSeconds,
  durationMs,
  requestMeta,
}: GeminiTrackedCallArgs): Promise<void> {
  const pricing = GEMINI_MODEL_PRICING[model];
  const usageHours = audioSeconds ? audioSeconds / 3600 : null;

  // Estimate cost: input + output + thinking tokens
  let estimatedCostUsd: number | null = null;
  if (pricing) {
    const { promptTokenCount, candidatesTokenCount, thoughtsTokenCount } = usageMetadata;
    estimatedCostUsd =
      (promptTokenCount * pricing.inputPerM) / 1_000_000 +
      (candidatesTokenCount * pricing.outputPerM) / 1_000_000 +
      (thoughtsTokenCount * pricing.thinkingPerM) / 1_000_000;
  }

  await safeInsertUsageEvent({
    transcript_id: transcriptId ?? 'unknown',
    provider: 'gemini',
    stage,
    operation,
    status: 'success',
    model,
    input_tokens: usageMetadata.promptTokenCount,
    output_tokens: usageMetadata.candidatesTokenCount,
    reasoning_tokens: usageMetadata.thoughtsTokenCount || null,
    total_tokens: usageMetadata.totalTokenCount,
    usage_hours: usageHours,
    usage_seconds: audioSeconds ? Math.round(audioSeconds) : null,
    usage_quantity_type: audioSeconds ? 'audio_hours' : null,
    rate_card_version: GEMINI_RATE_CARD_VERSION,
    base_rate_per_hour_usd: null, // Gemini is token-priced, not hour-priced
    pricing_meta: safeJsonStringify({ estimated_cost_usd: estimatedCostUsd, pricing }),
    duration_ms: durationMs,
    request_meta: safeJsonStringify(requestMeta),
  });
}

