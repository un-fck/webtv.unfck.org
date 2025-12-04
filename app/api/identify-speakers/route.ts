import { NextRequest, NextResponse } from 'next/server';
import { identifySpeakers } from '@/lib/speaker-identification';
import { getTranscriptById, updateTranscriptStatus, tryAcquirePipelineLock, releasePipelineLock } from '@/lib/turso';

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();
    
    if (!transcriptId) {
      return NextResponse.json({ error: 'transcriptId required' }, { status: 400 });
    }

    // Get transcript with raw paragraphs
    const transcript = await getTranscriptById(transcriptId);
    if (!transcript) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
    }
    
    // Try to acquire lock
    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (!acquired) {
      return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 });
    }

    try {
      // Use stored raw paragraphs or fetch from AssemblyAI
      let paragraphs = transcript.content.raw_paragraphs;
      
      if (!paragraphs || paragraphs.length === 0) {
        const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`, {
          headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
        });
        if (!response.ok) {
          throw new Error('Failed to fetch paragraphs from AssemblyAI');
        }
        const data = await response.json();
        paragraphs = data.paragraphs;
      }
      
      if (!paragraphs || paragraphs.length === 0) {
        throw new Error('No paragraphs available');
      }

      await updateTranscriptStatus(transcriptId, 'identifying_speakers');
      const mapping = await identifySpeakers(paragraphs, transcriptId);
      await updateTranscriptStatus(transcriptId, 'completed');
      await releasePipelineLock(transcriptId);

      // Return the updated transcript
      const updated = await getTranscriptById(transcriptId);
      return NextResponse.json({ 
        mapping,
        statements: updated?.content.statements || [],
        topics: updated?.content.topics || {}
      });
    } catch (error) {
      await updateTranscriptStatus(transcriptId, 'error', error instanceof Error ? error.message : 'Pipeline failed');
      await releasePipelineLock(transcriptId);
      throw error;
    }
  } catch (error) {
    console.error('Speaker identification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
