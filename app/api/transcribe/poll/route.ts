import { NextRequest, NextResponse } from 'next/server';
import { pollTranscription } from '@/lib/transcription';
import { getSpeakerMapping } from '@/lib/speakers';

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();
    
    if (!transcriptId) {
      return NextResponse.json({ error: 'Transcript ID required' }, { status: 400 });
    }

    const result = await pollTranscription(transcriptId);

    // If completed or has statements, include speaker mappings
    let speakerMappings = {};
    if (result.statements && result.statements.length > 0) {
      speakerMappings = await getSpeakerMapping(transcriptId) || {};
    }

    return NextResponse.json({
      ...result,
      speakerMappings,
    });
    
  } catch (error) {
    console.error('Poll error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
