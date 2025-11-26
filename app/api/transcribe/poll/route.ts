import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { pollTranscription } from '@/lib/transcription';

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();
    
    if (!transcriptId) {
      return NextResponse.json({ error: 'Transcript ID required' }, { status: 400 });
    }

    const status = await pollTranscription(transcriptId);

    if (status === 'completed') {
      const client = await getTursoClient();
      const result = await client.execute({
        sql: 'SELECT content FROM transcripts WHERE transcript_id = ?',
        args: [transcriptId]
      });

      if (result.rows.length > 0) {
        const content = typeof result.rows[0].content === 'string' 
          ? JSON.parse(result.rows[0].content as string) 
          : result.rows[0].content;
        
        return NextResponse.json({
          status: 'completed',
          statements: content.statements,
          topics: content.topics || {},
          transcriptId,
        });
      }
    } else if (status === 'error') {
      return NextResponse.json({ status: 'error' });
    }
    
    return NextResponse.json({ status: 'processing', transcriptId });
    
  } catch (error) {
    console.error('Poll error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

