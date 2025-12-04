import { NextRequest, NextResponse } from 'next/server';
import { getTranscript, saveTranscript, deleteTranscriptsForEntry } from '@/lib/turso';
import { getKalturaAudioUrl, submitTranscription, pollTranscription } from '@/lib/transcription';
import { getSpeakerMapping } from '@/lib/speakers';

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, checkOnly, force, startTime, endTime } = await request.json();
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Kaltura ID is required' }, { status: 400 });
    }
    
    const isSegmentRequest = startTime !== undefined && endTime !== undefined;
    const { entryId, audioUrl: baseDownloadUrl, flavorParamId, isLiveStream } = await getKalturaAudioUrl(kalturaId);

    // Check for existing transcript (unless force=true)
    if (!force) {
      // Check for any existing transcript (not just completed)
      const cached = await getTranscript(entryId, isSegmentRequest ? startTime : undefined, isSegmentRequest ? endTime : undefined, false);
      
      if (cached) {
        console.log('Found existing transcript:', cached.transcript_id, 'status:', cached.status);
        
        // If completed with statements, return directly
        if (cached.status === 'completed' && cached.content.statements?.length > 0) {
          const speakerMappings = await getSpeakerMapping(cached.transcript_id) || {};
          return NextResponse.json({
            statements: cached.content.statements,
            topics: cached.content.topics || {},
            speakerMappings,
            language: cached.language_code,
            cached: true,
            transcriptId: cached.transcript_id,
          });
        }
        
        // If in progress or needs to continue, poll for current state
        if (cached.status !== 'error') {
          const pollResult = await pollTranscription(cached.transcript_id);
          return NextResponse.json({
            transcriptId: cached.transcript_id,
            stage: pollResult.stage,
            raw_paragraphs: pollResult.raw_paragraphs,
            statements: pollResult.statements,
            topics: pollResult.topics,
          });
        }
        
        // If error, allow retry by falling through to create new
      }
    } else {
      await deleteTranscriptsForEntry(entryId);
    }

    if (checkOnly) {
      return NextResponse.json({ cached: false });
    }

    // Submit new transcript to AssemblyAI
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
        return NextResponse.json({ error: `Failed to download HLS: ${error}` }, { status: 500 });
      }
      
      const hlsData = await hlsResponse.json();
      audioUrl = hlsData.upload_url;
    }

    const transcriptId = await submitTranscription(audioUrl);
    console.log('✓ Submitted transcript:', transcriptId, 'for entryId:', entryId);

    await saveTranscript(
      entryId, transcriptId,
      isSegmentRequest ? startTime : null,
      isSegmentRequest ? endTime : null,
      audioUrl, 'transcribing', null,
      { statements: [], topics: {} }
    );

    return NextResponse.json({
      transcriptId,
      stage: 'transcribing',
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
