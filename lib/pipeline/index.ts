import { AzureOpenAI } from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import "@/lib/load-env";
import { setSpeakerMapping, type SpeakerInfo } from "@/lib/speakers";
import {
  getTranscriptById,
  updateTranscriptContent,
  updateTranscriptStatus,
  touchPipelineLock,
} from "@/lib/db";
import {
  trackOpenAIChatCompletion,
  UsageOperations,
  UsageStages,
} from "@/lib/usage-tracking";
import { getAnalysisModel } from "@/lib/providers/models";
import {
  type ParagraphInput,
  type SpeakerMapping,
  normalizeText,
  speakersEqual,
  buildStatementsWithSentences,
  IDENTIFICATION_RULES,
  COMMON_ABBREVIATIONS,
  SCHEMA_DEFINITIONS,
} from "./shared";
import { resegmentParagraph } from "./resegment";
import { defineTopics } from "./define-topics";
import { tagSentencesWithTopics } from "./tag-sentences";
import { analyzePropositions } from "./analyze-propositions";

// Re-exports preserve the historical public API of speaker-identification.ts.
export {
  normalizeText,
  speakersEqual,
  matchWordsToText,
  buildStatementsWithSentences,
} from "./shared";
export type {
  ParagraphWord,
  ParagraphInput,
  StatementWithSentences,
  SpeakerMapping,
} from "./shared";
export { analyzePropositions } from "./analyze-propositions";
export type {
  EvidenceQuote,
  Position,
  Proposition,
} from "./analyze-propositions";

const API_VERSION = "2025-01-01-preview";

/** Run async tasks with a concurrency limit */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

const ParagraphSpeakerMapping = z.object({
  paragraphs: z.array(
    z.object({
      index: z.number(),
      name: z.string().nullable(),
      function: z.string().nullable(),
      affiliation: z.string().nullable(),
      group: z.string().nullable(),
      has_multiple_speakers: z.boolean(),
      is_off_record: z.boolean(),
    }),
  ),
});

function createOpenAIClient() {
  return new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: API_VERSION,
  });
}

export async function identifySpeakers(
  paragraphs: ParagraphInput[],
  transcriptId?: string,
  prebuiltMapping?: SpeakerMapping,
  options?: { skipPropositions?: boolean },
) {
  if (!paragraphs?.length) {
    throw new Error("No paragraphs provided");
  }

  const client = createOpenAIClient();
  let finalParagraphs = [...paragraphs];
  let finalMapping: SpeakerMapping = {};

  if (prebuiltMapping) {
    // Gemini path: speaker identity already resolved — skip OpenAI speaker ID + resegmentation
    console.log(
      `  → Using pre-built speaker mapping for ${paragraphs.length} paragraphs (Gemini path)...`,
    );
    finalMapping = { ...prebuiltMapping };
  } else {
    // Legacy path: identify speakers via OpenAI (for transcripts without pre-built mapping)
    console.log(`  → Analyzing ${paragraphs.length} paragraphs...`);

    const transcriptParts = paragraphs.map((para, index) => {
      const asrSpeaker =
        para.speaker || para.words?.[0]?.speaker || "Unknown";
      return `[${index}] (ASR: Speaker ${asrSpeaker}) ${para.text}`;
    });

    const completion = await trackOpenAIChatCompletion({
      client,
      transcriptId,
      stage: UsageStages.identifyingSpeakers,
      operation: UsageOperations.openaiInitialSpeakerMapping,
      model: getAnalysisModel(),
      requestMeta: { paragraph_count: paragraphs.length },
      request: {
        model: getAnalysisModel(),
        reasoning_effort: "medium" as const,
        messages: [
          {
            role: "system",
            content: `You are an expert at identifying speakers in UN proceedings. For each paragraph in the transcript, extract the speaker's name, function/title, affiliation, and country-group information strictly from the context.

CRITICAL: Identify WHO IS ACTUALLY SPEAKING each paragraph, NOT who is being introduced or mentioned.

TASK:
- Each paragraph is numbered [0], [1], [2], etc.
- Each paragraph has an ASR speaker label (A, B, C, etc.) - these are HINTS from automatic diarization
- WARNING: ASR labels may be incorrect or inconsistent - use them as hints, not facts
- For each paragraph, identify the ACTUAL SPEAKER (person saying those words) based on the text content
- IMPORTANT: If a paragraph contains "I invite X" or "X has the floor", the speaker is the person doing the inviting/giving the floor (usually the Chair), NOT X
- X will speak in SUBSEQUENT paragraphs
- When a speaker continues across multiple paragraphs, repeat their information
- Process EVERY paragraph from [0] to [last]. Never stop early.

MIXED SPEAKER DETECTION:
Your task is to determine: Does this paragraph contain speech from multiple different people?

Focus on WHO IS SPEAKING, not keyword patterns. Ask yourself:
- Is the entire paragraph spoken by one person?
- Or does it contain words from multiple different speakers?

Common scenarios where paragraphs mix speakers:
  - Previous speaker finishes their remarks, then chair/moderator responds
  - Chair gives floor to someone, and that person begins speaking
  - Question and answer both captured in same paragraph
  - Brief exchanges between people in informal settings
  - Speaker concludes, procedural language follows

Helpful indicators (but not hard rules):
  - Shift from one person's remarks to another person's procedural language
  - Topic/tone/perspective changes midway through paragraph
  - First-person speech mixed with third-person procedural descriptions
  - ASR speaker labels changing within the paragraph
  - Phrases like "I give/invite/call upon [Name]" followed by more text

NOT mixed speakers:
  - Opening courtesies within one person's speech ("Thank you, Chair. Today I will discuss...")
  - One person's continuous remarks, even if long or referring to others
  - Rhetorical questions, quotes, or historical references within one speech
  - Pure procedural language from one chair/moderator

When uncertain, flag it - we'll verify during resegmentation. The goal is to catch genuine multi-speaker paragraphs while avoiding obvious false positives.

OFF-RECORD CONTENT DETECTION:
Mark is_off_record = true for paragraphs that are clearly NOT part of the formal meeting/proceeding.

ONLY mark paragraphs at the VERY START or VERY END of the transcript. NEVER mark middle paragraphs.

Examples of off-record content:
  - Pre-meeting small talk, audio testing, technical checks
  - "Can you hear me?", "Testing, testing", "Is the mic on?"
  - Private conversations before the meeting starts
  - Gibberish, single words with no context (e.g., just "It", just "Okay")
  - Post-meeting informal remarks clearly after formal closing
  - Background noise transcribed as words

Only mark as off-record when it's VERY CLEAR the content is not part of the official proceeding.
If uncertain, mark as false - better to include too much than exclude formal content.

Typical patterns:
  - First 1-3 paragraphs: check if they're pre-meeting chatter before formal opening
  - Last 1-3 paragraphs: check if they're post-meeting remarks after formal closing
  - Middle paragraphs: ALWAYS mark is_off_record = false

${IDENTIFICATION_RULES}

${COMMON_ABBREVIATIONS}

${SCHEMA_DEFINITIONS}

has_multiple_speakers: Boolean - Does this paragraph contain words spoken by multiple different people? True if multiple speakers' words are mixed together, false if one person speaks the entire paragraph.

is_off_record: Boolean - Is this paragraph clearly NOT part of the formal meeting? Only true for paragraphs at the very start/end that are obviously pre-meeting chatter, audio tests, gibberish, or post-meeting remarks. When uncertain, use false.
`,
          },
          {
            role: "user",
            content: `Analyze the following UN transcript and identify the speaker for each numbered paragraph.

Transcript:
${transcriptParts.join("\n\n")}`,
          },
        ],
        response_format: zodResponseFormat(
          ParagraphSpeakerMapping,
          "paragraph_speaker_mapping",
        ),
      },
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) throw new Error("Failed to identify speakers");

    const parsed = JSON.parse(result) as z.infer<
      typeof ParagraphSpeakerMapping
    >;
    console.log(`  ✓ Initial identification complete`);

    // Log off-record paragraphs
    const offRecord = parsed.paragraphs
      .filter((p) => p.is_off_record)
      .map((p) => p.index);
    if (offRecord.length > 0) {
      console.log(
        `  ℹ Found ${offRecord.length} off-record paragraph(s): [${offRecord.join(", ")}]`,
      );
    }

    // Collect paragraphs needing resegmentation. Splitting a paragraph into
    // sub-segments requires per-word timing to place the split boundary in
    // time; without words a paragraph is already the smallest honest unit, so
    // skip it (no fabricated sub-timing).
    const toResegment = parsed.paragraphs
      .filter((p) => p.has_multiple_speakers)
      .map((p) => p.index)
      .filter((idx) => (paragraphs[idx]?.words?.length ?? 0) > 0);

    // Build initial mapping
    parsed.paragraphs.forEach((para) => {
      finalMapping[para.index.toString()] = {
        name: para.name,
        function: para.function,
        affiliation: para.affiliation,
        group: para.group,
        is_off_record: para.is_off_record || undefined,
      };
    });

    // Resegment in parallel
    if (toResegment.length > 0) {
      console.log(
        `  → Found ${toResegment.length} paragraph(s) with mixed speakers: [${toResegment.join(", ")}]`,
      );

      const CONTEXT_SIZE = 3; // Number of paragraphs before and after

      // Resegmentation is the longest stage on big debates. Refresh the
      // pipeline lock at most every 30s as paragraphs complete so a job still
      // making progress keeps its lock fresh and isn't re-entered concurrently.
      let lastHeartbeat = Date.now();
      const heartbeat = async () => {
        if (!transcriptId) return;
        if (Date.now() - lastHeartbeat < 30_000) return;
        lastHeartbeat = Date.now();
        await touchPipelineLock(transcriptId).catch(() => {});
      };

      const resegmented = await mapWithConcurrency(
        toResegment,
        10,
        async (idx) => {
          const para = paragraphs[idx];
          const speaker = finalMapping[idx.toString()];

          // Gather context paragraphs
          const contextParas: Array<{
            para: ParagraphInput;
            speaker: SpeakerInfo;
            position: "before" | "current" | "after";
          }> = [];

          // Add before context
          for (let i = Math.max(0, idx - CONTEXT_SIZE); i < idx; i++) {
            contextParas.push({
              para: paragraphs[i],
              speaker: finalMapping[i.toString()],
              position: "before",
            });
          }

          // Add current
          contextParas.push({
            para: para,
            speaker: speaker,
            position: "current",
          });

          // Add after context
          for (
            let i = idx + 1;
            i <= Math.min(paragraphs.length - 1, idx + CONTEXT_SIZE);
            i++
          ) {
            contextParas.push({
              para: paragraphs[i],
              speaker: finalMapping[i.toString()],
              position: "after",
            });
          }

          const result = await resegmentParagraph(
            client,
            para,
            contextParas,
            idx,
            transcriptId,
          );
          await heartbeat();
          return { index: idx, ...result };
        },
      );
      console.log(`  ✓ Resegmentation and speaker identification complete`);
      console.log(`  → Rebuilding transcript with split paragraphs...`);

      // Rebuild paragraphs array and mapping
      const newParagraphs: ParagraphInput[] = [];
      const newMapping: SpeakerMapping = {};
      let currentNewIndex = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        const reseg = resegmented.find((r) => r.index === i);

        if (reseg) {
          // Replace with segments
          for (let j = 0; j < reseg.segments.length; j++) {
            newParagraphs.push(reseg.segments[j]);
            newMapping[currentNewIndex.toString()] = reseg.speakers[j];
            currentNewIndex++;
          }
        } else {
          // Keep original
          newParagraphs.push(paragraphs[i]);
          newMapping[currentNewIndex.toString()] = finalMapping[i.toString()];
          currentNewIndex++;
        }
      }

      finalParagraphs = newParagraphs;
      finalMapping = newMapping;
      console.log(
        `  ✓ Rebuilt transcript: ${paragraphs.length} → ${finalParagraphs.length} paragraphs`,
      );
    }
  } // end legacy path (else block)

  // Filter out off-record paragraphs
  const offRecordIndices = Object.keys(finalMapping)
    .filter((idx) => finalMapping[idx]?.is_off_record)
    .map((idx) => parseInt(idx));

  if (offRecordIndices.length > 0) {
    console.log(
      `  → Filtering out ${offRecordIndices.length} off-record paragraph(s): [${offRecordIndices.join(", ")}]`,
    );

    // Remove from paragraphs array
    const filteredParagraphs: ParagraphInput[] = [];
    const filteredMapping: SpeakerMapping = {};
    let newIndex = 0;

    for (let i = 0; i < finalParagraphs.length; i++) {
      if (!finalMapping[i.toString()]?.is_off_record) {
        filteredParagraphs.push(finalParagraphs[i]);
        const speaker = { ...finalMapping[i.toString()] };
        delete speaker.is_off_record; // Remove flag from final output
        filteredMapping[newIndex.toString()] = speaker;
        newIndex++;
      }
    }

    finalParagraphs = filteredParagraphs;
    finalMapping = filteredMapping;
    console.log(`  ✓ Kept ${finalParagraphs.length} on-record paragraphs`);
  }

  // Group consecutive same-speaker paragraphs
  if (finalParagraphs.length > 0) {
    const groupedParagraphs: ParagraphInput[] = [];
    const groupedMapping: SpeakerMapping = {};

    let currentGroup = { ...finalParagraphs[0] };
    let currentSpeaker = finalMapping["0"];

    for (let i = 1; i < finalParagraphs.length; i++) {
      const para = finalParagraphs[i];
      const speaker = finalMapping[i.toString()];

      if (speakersEqual(currentSpeaker, speaker)) {
        const hasWords =
          (currentGroup.words?.length ?? 0) > 0 &&
          (para.words?.length ?? 0) > 0;
        if (hasWords) {
          // Merge with current group, concatenating real word timestamps.
          currentGroup = {
            ...currentGroup,
            text: currentGroup.text + "\n\n" + para.text,
            end: para.end,
            words: [...(currentGroup.words ?? []), ...(para.words ?? [])],
          };
        } else {
          // No word timing: merge text but preserve each provider segment's
          // real start/end as a segment so per-segment sentences can be built.
          const existingSegs = currentGroup.segments ?? [
            {
              text: currentGroup.text,
              start: currentGroup.start,
              end: currentGroup.end,
            },
          ];
          currentGroup = {
            ...currentGroup,
            text: currentGroup.text + "\n\n" + para.text,
            end: para.end,
            segments: [
              ...existingSegs,
              { text: para.text, start: para.start, end: para.end },
            ],
          };
        }
      } else {
        // Save current group and start new
        groupedParagraphs.push(currentGroup);
        groupedMapping[groupedParagraphs.length - 1] = currentSpeaker;
        currentGroup = { ...para };
        currentSpeaker = speaker;
      }
    }

    // Don't forget the last group
    groupedParagraphs.push(currentGroup);
    groupedMapping[groupedParagraphs.length - 1] = currentSpeaker;

    if (groupedParagraphs.length < finalParagraphs.length) {
      console.log(
        `  ✓ Grouped consecutive same-speaker paragraphs: ${finalParagraphs.length} → ${groupedParagraphs.length} paragraphs`,
      );
    }

    finalParagraphs = groupedParagraphs;
    finalMapping = groupedMapping;
  }

  // Build statements with sentences
  const statementsWithSentences = buildStatementsWithSentences(finalParagraphs);

  // Save statements immediately after speaker identification (before topic analysis)
  if (transcriptId) {
    console.log(`  → Saving speaker identification results...`);
    const transcript = await getTranscriptById(transcriptId);
    if (transcript) {
      await updateTranscriptContent(transcriptId, {
        raw_paragraphs: transcript.content.raw_paragraphs,
        statements: statementsWithSentences,
        topics: {},
      });
      await setSpeakerMapping(transcriptId, finalMapping);
      console.log(`  ✓ Saved statements and speaker mappings`);
    }
  }

  // Define and tag topics
  let topics: Record<
    string,
    { key: string; label: string; description: string }
  > = {};
  let taggedStatements = statementsWithSentences;

  if (statementsWithSentences.length > 0 && transcriptId) {
    // --- Stage: Analyzing topics ---
    await updateTranscriptStatus(transcriptId, "analyzing_topics");
    await touchPipelineLock(transcriptId); // heartbeat: keep the lock fresh
    console.log(`  → Analyzing topics...`);

    try {
      topics = await defineTopics(
        finalParagraphs,
        finalMapping,
        client,
        transcriptId,
      );
      taggedStatements = await tagSentencesWithTopics(
        statementsWithSentences,
        topics,
        finalMapping,
        client,
        transcriptId,
      );

      // Save topics immediately so the frontend can show them while propositions are analyzed
      const transcriptForTopics = await getTranscriptById(transcriptId);
      if (transcriptForTopics) {
        await updateTranscriptContent(transcriptId, {
          raw_paragraphs: transcriptForTopics.content.raw_paragraphs,
          statements: taggedStatements,
          topics,
        });
        console.log(`  ✓ Saved topics`);
      }
    } catch (error) {
      console.warn(
        `  ⚠ Failed to analyze topics:`,
        error instanceof Error ? error.message : error,
      );
      // Keep the statements without topics — still continue to propositions
    }

    if (!options?.skipPropositions) {
      // --- Stage: Analyzing propositions ---
      await updateTranscriptStatus(transcriptId, "analyzing_propositions");
      await touchPipelineLock(transcriptId); // heartbeat: keep the lock fresh
      console.log(`  → Analyzing propositions...`);

      try {
        const propositions = await analyzePropositions(
          finalParagraphs,
          finalMapping,
          client,
          transcriptId,
        );

        const transcriptForProps = await getTranscriptById(transcriptId);
        if (transcriptForProps) {
          await updateTranscriptContent(transcriptId, {
            raw_paragraphs: transcriptForProps.content.raw_paragraphs,
            statements: taggedStatements,
            topics,
            propositions,
          });
          console.log(`  ✓ Saved propositions`);
        }
      } catch (error) {
        console.warn(
          `  ⚠ Failed to analyze propositions:`,
          error instanceof Error ? error.message : error,
        );
      }
    } else {
      console.log(`  ℹ Skipping proposition analysis (on-demand)`);
    }

    await updateTranscriptStatus(transcriptId, "completed");
  }

  return finalMapping;
}
