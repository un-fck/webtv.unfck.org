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

      // Get existing record from Turso to check status and retrieve metadata
      const client = await getTursoClient();
      const result = await client.execute({
        sql: 'SELECT entry_id, audio_url, start_time, end_time, status FROM transcripts WHERE transcript_id = ?',
        args: [transcriptId]
      });

      if (result.rows.length > 0) {
        const row = result.rows[0];
        
        // Only save if not already saved as completed
        if (row.status !== 'completed') {
          console.log('Saving completed transcript to Turso:', {
            transcriptId,
            entryId: row.entry_id,
            paragraphCount: paragraphsData?.paragraphs?.length || 0
          });
          
          // Update Turso with completed transcript
          // Initially save with empty statements - speaker identification will populate it later
          await saveTranscript(
            row.entry_id as string,
            transcriptId,
            row.start_time as number | null,
            row.end_time as number | null,
            row.audio_url as string,
            'completed',
            transcript.language_code,
            { statements: [], topics: {} }
          );
          console.log('✓ Saved to Turso successfully');
          
          // Trigger speaker identification
          console.log('Triggering speaker identification for:', transcriptId);
          try {
            const identifyResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/identify-speakers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcriptId }),
            });
            
            if (identifyResponse.ok) {
              console.log('✓ Speaker identification triggered');
            } else {
              console.error('Failed to trigger speaker identification');
            }
          } catch (err) {
            console.error('Error triggering speaker identification:', err);
          }
        }
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

