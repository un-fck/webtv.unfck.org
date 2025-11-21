import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient, saveTranscript } from '@/lib/turso';

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();
    
    if (!transcriptId) {
      return NextResponse.json({ error: 'Transcript ID required' }, { status: 400 });
    }

    // Check transcript status
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
    });

    if (!pollResponse.ok) {
      return NextResponse.json({ error: 'Failed to poll status' }, { status: 500 });
    }

    const transcript = await pollResponse.json();

    if (transcript.status === 'completed') {
      // Fetch paragraphs
      const paragraphsResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`, {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
      });

      const paragraphsData = paragraphsResponse.ok ? await paragraphsResponse.json() : null;

      // Get existing record from Turso to retrieve entry_id and audio_url
      const client = await getTursoClient();
      const result = await client.execute({
        sql: 'SELECT entry_id, audio_url, start_time, end_time FROM transcripts WHERE transcript_id = ?',
        args: [transcriptId]
      });

      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log('Saving completed transcript to Turso:', {
          transcriptId,
          entryId: row.entry_id,
          paragraphCount: paragraphsData?.paragraphs?.length || 0
        });
        // Update Turso with completed transcript
        await saveTranscript(
          row.entry_id as string,
          transcriptId,
          row.start_time as number | null,
          row.end_time as number | null,
          row.audio_url as string,
          'completed',
          transcript.language_code,
          { paragraphs: paragraphsData?.paragraphs || [] }
        );
        console.log('✓ Saved to Turso successfully');
      } else {
        console.error('No transcript record found in Turso for transcriptId:', transcriptId);
      }

      return NextResponse.json({
        status: 'completed',
        text: transcript.text,
        words: transcript.words || [],
        paragraphs: paragraphsData?.paragraphs || null,
        language: transcript.language_code,
        transcriptId,
      });
    } else if (transcript.status === 'error') {
      return NextResponse.json({
        status: 'error',
        error: transcript.error,
      });
    } else {
      return NextResponse.json({
        status: transcript.status, // 'queued' or 'processing'
      });
    }
    
  } catch (error) {
    console.error('Poll error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

