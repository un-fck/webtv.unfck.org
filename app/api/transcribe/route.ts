import { NextRequest, NextResponse } from 'next/server';
import { getTranscript, saveTranscript, deleteTranscriptsForEntry } from '@/lib/turso';
import { getKalturaAudioUrl, submitTranscription } from '@/lib/transcription';

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, checkOnly, force, startTime, endTime } = await request.json();
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Kaltura ID is required' }, { status: 400 });
    }
    
    const isSegmentRequest = startTime !== undefined && endTime !== undefined;

    // Get audio download URL from Kaltura
    const { entryId, audioUrl: baseDownloadUrl, flavorParamId, isLiveStream } = await getKalturaAudioUrl(kalturaId);

    // Check Turso for existing transcript (unless force=true)
    if (!force) {
      const cached = await getTranscript(
        entryId, 
        isSegmentRequest ? startTime : undefined, 
        isSegmentRequest ? endTime : undefined
      );
      
      console.log('Turso check for entryId:', entryId, 'cached:', cached ? `found (${cached.status}, ${cached.content.statements?.length || 0} statements)` : 'not found');
      
      if (cached && cached.status === 'completed') {
        console.log('✓ Using cached transcript:', cached.transcript_id);
        
        if (!cached.content.statements) {
          return NextResponse.json({ error: 'Transcript uses old format, please retranscribe' }, { status: 400 });
        }
        
        // If statements array is empty, trigger speaker identification and tell frontend to poll
        if (cached.content.statements.length === 0) {
          console.log('Cached transcript has 0 statements, triggering speaker identification');
          
          // Trigger speaker identification in background (fire and forget)
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/identify-speakers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptId: cached.transcript_id }),
          }).catch(err => {
            console.error('Error triggering speaker identification:', err);
          });
          
          console.log('✓ Speaker identification triggered, returning processing status');
          
          // Return the transcript ID so frontend can poll for completion
          return NextResponse.json({
            transcriptId: cached.transcript_id,
            status: 'processing',
          });
        }
        
        return NextResponse.json({
          statements: cached.content.statements,
          language: cached.language_code,
          cached: true,
          transcriptId: cached.transcript_id,
          topics: cached.content.topics || {},
        });
      }
    } else {
      // Delete existing transcripts when force=true
      await deleteTranscriptsForEntry(entryId);
    }

    // If checkOnly, return early
    if (checkOnly) {
      return NextResponse.json({ cached: false, text: null });
    }

    // Submit new transcript to AssemblyAI
    // For live streams, download HLS segments and upload to AssemblyAI
    let audioUrl = baseDownloadUrl;
    
    if (isLiveStream) {
      console.log('Live stream detected, downloading HLS segments...');
      
      const hlsResponse = await fetch(`${request.url.split('/api/transcribe')[0]}/api/download-hls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId,
          flavorParamsId: flavorParamId,
          startTime: isSegmentRequest ? startTime : undefined,
          endTime: isSegmentRequest ? endTime : undefined,
        }),
      });
      
      if (!hlsResponse.ok) {
        const error = await hlsResponse.text();
        console.error('HLS download error:', error);
        return NextResponse.json({ error: `Failed to download HLS: ${error}` }, { status: 500 });
      }
      
      const hlsData = await hlsResponse.json();
      audioUrl = hlsData.upload_url;
      console.log('HLS uploaded to AssemblyAI:', audioUrl);
    }
    
    console.log('Submitting to AssemblyAI:', { 
      isSegment: isSegmentRequest, 
      isLiveStream,
      audioUrl
    });

    const transcriptId = await submitTranscription(audioUrl);
    console.log('✓ Submitted transcript:', transcriptId, 'for entryId:', entryId);

    // Save initial transcript record to Turso
    await saveTranscript(
      entryId,
      transcriptId,
      isSegmentRequest ? startTime : null,
      isSegmentRequest ? endTime : null,
      audioUrl,
      'processing',
      null,
      { statements: [], topics: {} }
    );
    console.log('✓ Saved initial record to Turso');

    // Return transcript ID immediately for client-side polling
    return NextResponse.json({
      transcriptId,
      status: 'processing',
      segmentStart: isSegmentRequest ? startTime : undefined,
      segmentEnd: isSegmentRequest ? endTime : undefined,
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

