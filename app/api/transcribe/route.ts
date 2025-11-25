import { NextRequest, NextResponse } from 'next/server';
import { getTranscript, saveTranscript, deleteTranscriptsForEntry } from '@/lib/turso';

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, checkOnly, force, startTime, endTime } = await request.json();
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Kaltura ID is required' }, { status: 400 });
    }
    
    const isSegmentRequest = startTime !== undefined && endTime !== undefined;

    // Get audio download URL from Kaltura
    const apiResponse = await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '1': {
          service: 'session',
          action: 'startWidgetSession',
          widgetId: '_2503451',
        },
        '2': {
          service: 'baseEntry',
          action: 'list',
          ks: '{1:result:ks}',
          filter: { redirectFromEntryId: kalturaId },
          responseProfile: { type: 1, fields: 'id,duration' },
        },
        '3': {
          service: 'flavorAsset',
          action: 'list',
          ks: '{1:result:ks}',
          filter: { entryIdEqual: '{2:result:objects:0:id}' },
        },
        apiVersion: '3.3.0',
        format: 1,
        ks: '',
        clientTag: 'html5:v3.17.30',
        partnerId: 2503451,
      }),
    });

    if (!apiResponse.ok) {
      return NextResponse.json({ error: 'Failed to query Kaltura API' }, { status: 500 });
    }

    const apiData = await apiResponse.json();
    const entryId = apiData[1]?.objects?.[0]?.id;
    
    if (!entryId) {
      return NextResponse.json({ error: 'No entry found' }, { status: 404 });
    }

    // Find English audio track
    const flavors = apiData[2]?.objects || [];
    const englishCandidates = flavors.filter((f: { language?: string; tags?: string }) => 
      f.language?.toLowerCase() === 'english' && f.tags?.includes('audio_only')
    );
    const preferredFlavor = englishCandidates.find((f: { status?: number; isDefault?: boolean }) => f.status === 2 && f.isDefault)
      || englishCandidates.find((f: { status?: number }) => f.status === 2)
      || englishCandidates[0];
    const flavorParamId = preferredFlavor?.flavorParamsId || 100; // Fallback to 100
    
    const baseDownloadUrl = `https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/${entryId}/format/download/protocol/https/flavorParamIds/${flavorParamId}`;
    
    // Check if this is a live stream entry
    const isLiveStream = apiData[1]?.objects?.[0]?.objectType === 'KalturaLiveStreamEntry';

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
        
        // If statements array is empty, trigger speaker identification
        if (cached.content.statements.length === 0) {
          console.log('Cached transcript has 0 statements, triggering speaker identification');
          try {
            const identifyResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/identify-speakers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcriptId: cached.transcript_id }),
            });
            
            if (identifyResponse.ok) {
              const identifyData = await identifyResponse.json();
              console.log('✓ Speaker identification completed, returning data');
              return NextResponse.json({
                statements: identifyData.statements,
                language: cached.language_code,
                cached: true,
                transcriptId: cached.transcript_id,
                topics: identifyData.topics || {},
              });
            } else {
              console.error('Failed to identify speakers');
            }
          } catch (err) {
            console.error('Error during speaker identification:', err);
          }
          // If identification failed, fall through to return empty statements
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
    
    const submitBody = {
      audio_url: audioUrl,
      speaker_labels: true,
      keyterms_prompt: [
        'UN80',
        'Carolyn Schwalger',
        'Brian Wallace',
        'Guy Ryder',
      ],
    };
    
    console.log('Submitting to AssemblyAI:', { 
      isSegment: isSegmentRequest, 
      isLiveStream,
      audioUrl
    });

    const submitResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': process.env.ASSEMBLYAI_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submitBody),
    });

    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      console.error('AssemblyAI submit error:', error);
      return NextResponse.json({ error: `Failed to submit: ${error}` }, { status: 500 });
    }

    const submitData = await submitResponse.json();
    const transcriptId = submitData.id;
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

