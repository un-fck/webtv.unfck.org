import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getTranscriptById } from '@/lib/turso';
import { suggestTrackedItems } from '@/lib/sentiment-analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript_id } = body;

    if (!transcript_id) {
      return NextResponse.json({ error: 'transcript_id is required' }, { status: 400 });
    }

    const transcript = await getTranscriptById(transcript_id);
    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const suggestions = await suggestTrackedItems(transcript_id, transcript.content, client);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Failed to suggest tracked items:', error);
    return NextResponse.json({ error: 'Failed to suggest tracked items' }, { status: 500 });
  }
}
