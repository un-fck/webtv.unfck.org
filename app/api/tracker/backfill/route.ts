import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAllTranscriptsForEntry, getAllTranscriptedEntries, getTranscriptById, getVideoByEntryId } from '@/lib/turso';
import { getSpeakerMapping } from '@/lib/speakers';
import { runSentimentAnalysis } from '@/lib/sentiment-analysis';
import { getTrackedItems } from '@/lib/sentiment-db';

export async function POST() {
  try {
    const trackedItems = await getTrackedItems();
    if (trackedItems.length === 0) {
      return NextResponse.json({ message: 'No tracked items to analyze', analyzed: 0 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const entryIds = await getAllTranscriptedEntries();

    let analyzed = 0;
    const errors: string[] = [];

    for (const entryId of entryIds) {
      try {
        const transcripts = await getAllTranscriptsForEntry(entryId);
        const video = await getVideoByEntryId(entryId);
        const meetingDate = video?.date ?? new Date().toISOString().split('T')[0];

        for (const transcript of transcripts) {
          if (!transcript.content.topics || Object.keys(transcript.content.topics).length === 0) continue;

          const speakerMapping = await getSpeakerMapping(transcript.transcript_id);
          if (!speakerMapping) continue;

          try {
            await runSentimentAnalysis(
              transcript.transcript_id,
              entryId,
              meetingDate,
              transcript.content,
              speakerMapping,
              client,
            );
            analyzed++;
          } catch (error) {
            const msg = `Failed for transcript ${transcript.transcript_id}: ${error instanceof Error ? error.message : error}`;
            console.warn(msg);
            errors.push(msg);
          }
        }
      } catch (error) {
        const msg = `Failed for entry ${entryId}: ${error instanceof Error ? error.message : error}`;
        console.warn(msg);
        errors.push(msg);
      }
    }

    return NextResponse.json({
      message: `Backfill complete`,
      analyzed,
      total_entries: entryIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Backfill failed:', error);
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 });
  }
}
