import { NextRequest, NextResponse } from 'next/server';
import { identifySpeakers } from '@/lib/speaker-identification';
import { getTursoClient, getTranscript } from '@/lib/turso';

export async function POST(request: NextRequest) {
  try {
    const { paragraphs, transcriptId, entryId } = await request.json();
    
    // If only transcriptId provided, fetch paragraphs from AssemblyAI
    let paragraphsData = paragraphs;
    let entryIdValue = entryId;
    
    if (!paragraphsData && transcriptId) {
      console.log('Fetching paragraphs from AssemblyAI for transcriptId:', transcriptId);
      
      // Get entry_id from Turso if not provided
      if (!entryIdValue) {
        const client = await getTursoClient();
        const result = await client.execute({
          sql: 'SELECT entry_id FROM transcripts WHERE transcript_id = ?',
          args: [transcriptId]
        });
        if (result.rows.length > 0) {
          entryIdValue = result.rows[0].entry_id as string;
        }
      }
      
      // Fetch from AssemblyAI
      const paragraphsResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`, {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
      });
      
      if (!paragraphsResponse.ok) {
        return NextResponse.json({ error: 'Failed to fetch paragraphs from AssemblyAI' }, { status: 500 });
      }
      
      const data = await paragraphsResponse.json();
      paragraphsData = data.paragraphs;
    }
    
    if (!paragraphsData || paragraphsData.length === 0) {
      return NextResponse.json({ error: 'No paragraphs available' }, { status: 400 });
    }

    // Run speaker identification (this saves to Turso)
    const mapping = await identifySpeakers(paragraphsData, transcriptId, entryIdValue);

    // Fetch the updated transcript from Turso to get statements and topics
    if (transcriptId && entryIdValue) {
      const updatedTranscript = await getTranscript(entryIdValue);
      if (updatedTranscript) {
        return NextResponse.json({ 
          mapping,
          statements: updatedTranscript.content.statements,
          topics: updatedTranscript.content.topics || {}
        });
      }
    }

    // Fallback if we can't fetch the updated transcript
    return NextResponse.json({ 
      mapping,
      statements: [],
      topics: {}
    });
    
  } catch (error) {
    console.error('Speaker identification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

