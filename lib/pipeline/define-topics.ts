import { AzureOpenAI } from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { SpeakerMapping } from "@/lib/speakers";
import {
  trackOpenAIChatCompletion,
  UsageOperations,
  UsageStages,
} from "@/lib/usage-tracking";
import { getAnalysisModel } from "@/lib/providers/models";
import type { ParagraphInput } from "./shared";

const TopicDefinitions = z.object({
  topics: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string(),
    }),
  ),
});

export async function defineTopics(
  paragraphs: ParagraphInput[],
  speakerMapping: SpeakerMapping,
  client: AzureOpenAI,
  transcriptId?: string,
): Promise<
  Record<string, { key: string; label: string; description: string }>
> {
  console.log(`  → Defining topics...`);

  // Build context with paragraphs and speakers, excluding moderators/chairs
  const substantiveStatements = paragraphs
    .map((p, idx) => {
      const speaker = speakerMapping[idx.toString()];
      const isChair =
        speaker?.function?.toLowerCase().includes("chair") ||
        speaker?.function?.toLowerCase().includes("president") ||
        speaker?.function?.toLowerCase().includes("moderator");
      return { paragraph: p, index: idx, speaker, isChair };
    })
    .filter(({ isChair }) => !isChair);

  if (substantiveStatements.length < 2) {
    console.log(
      `  ℹ Too few non-chair statements (${substantiveStatements.length}), skipping topic analysis`,
    );
    return {};
  }

  const contextParts = substantiveStatements.map(
    ({ paragraph, index, speaker }) => {
      const speakerLabel = speaker?.name || speaker?.affiliation || "Unknown";
      return `[${index}] ${speakerLabel}: ${paragraph.text}`;
    },
  );

  const completion = await trackOpenAIChatCompletion({
    client,
    transcriptId,
    stage: UsageStages.analyzingTopics,
    operation: UsageOperations.openaiDefineTopics,
    model: getAnalysisModel(),
    requestMeta: {
      paragraph_count: paragraphs.length,
      substantive_statements: substantiveStatements.length,
    },
    request: {
      model: getAnalysisModel(),
      reasoning_effort: "medium" as const,
      messages: [
        {
          role: "system",
          content: `You are analyzing a UN proceedings transcript to identify main discussion topics.

TASK:
- Identify 5-10 distinct topics discussed in the transcript
- Each topic must appear in at least 2 different statements by different speakers
- Focus on substantive policy topics, not procedural matters
- For each topic provide:
  - key: kebab-case slug (2-4 words, e.g., "climate-finance")
  - label: Human-readable title with proper case, spaces, and special characters (e.g., "Climate Finance")
  - description: Clear 1-2 sentence explanation

EXAMPLES:
- key: "climate-finance", label: "Climate Finance", description: "Financing mechanisms for climate action and adaptation"
- key: "peacekeeping-mandate", label: "Peacekeeping Mandate", description: "Scope and renewal of peacekeeping operations"
- key: "humanitarian-access", label: "Humanitarian Access", description: "Ensuring humanitarian aid reaches affected populations"
- key: "sdg-implementation", label: "SDG Implementation", description: "Progress on Sustainable Development Goals"

OUTPUT:
- Return 5-10 topics as an array
- Each topic must have key, label, and description fields`,
        },
        {
          role: "user",
          content: `Analyze these statements from a UN proceeding and identify the main topics:

${contextParts.join("\n\n")}`,
        },
      ],
      response_format: zodResponseFormat(TopicDefinitions, "topics"),
    },
  });

  const result = completion.choices[0]?.message?.content;
  if (!result) throw new Error("Failed to define topics");

  const parsed = JSON.parse(result) as z.infer<typeof TopicDefinitions>;

  // Convert array to record for easier lookup
  const topicsRecord: Record<
    string,
    { key: string; label: string; description: string }
  > = {};
  parsed.topics.forEach((topic) => {
    topicsRecord[topic.key] = topic;
  });

  const topicKeys = Object.keys(topicsRecord);
  console.log(
    `  ✓ Identified ${topicKeys.length} topics: [${topicKeys.join(", ")}]`,
  );

  return topicsRecord;
}
