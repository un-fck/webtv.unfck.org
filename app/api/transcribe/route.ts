import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, checkOnly, force } = await request.json();
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Kaltura ID is required' }, { status: 400 });
    }

    // Get audio download URL from Kaltura
    // flavorParamIds 100-117 are audio-only tracks in different languages
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
          responseProfile: {
            type: 1,
            fields: 'id,duration',
          },
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

    // Request English audio track (flavorParamId 100) - smallest file size
    const downloadUrl = `https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/${entryId}/format/download/protocol/https/flavorParamIds/100`;

    // Check AssemblyAI for existing transcript (unless force=true)
    if (!force) {
      const listResponse = await fetch('https://api.assemblyai.com/v2/transcript?limit=100', {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
      });

      if (listResponse.ok) {
        const listData = await listResponse.json();
        const existing = listData.transcripts?.find((t: { audio_url: string; status: string; id: string }) => 
          t.audio_url === downloadUrl && t.status === 'completed'
        );

        if (existing) {
          const detailResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${existing.id}`, {
            headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
          });
          
          if (detailResponse.ok) {
            const detail = await detailResponse.json();
            
            // Fetch paragraphs for cached transcript too
            const paragraphsResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${existing.id}/paragraphs`, {
              headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
            });
            const paragraphsData = paragraphsResponse.ok ? await paragraphsResponse.json() : null;
            
            return NextResponse.json({
              text: detail.text,
              words: detail.words || [],
              paragraphs: paragraphsData?.paragraphs || null,
              language: detail.language_code,
              cached: true,
            });
          }
        }
      }
    }

    // If checkOnly, return early
    if (checkOnly) {
      return NextResponse.json({ cached: false, text: null });
    }

    // Submit new transcript to AssemblyAI
    const submitResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': process.env.ASSEMBLYAI_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: downloadUrl,
        speaker_labels: true,
      }),
    });

    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      return NextResponse.json({ error: `Failed to submit: ${error}` }, { status: 500 });
    }

    const submitData = await submitResponse.json();
    const transcriptId = submitData.id;

    // Poll until completed
    let transcript;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Poll every 3 seconds
      
      const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
      });

      if (!pollResponse.ok) {
        return NextResponse.json({ error: 'Failed to poll status' }, { status: 500 });
      }

      transcript = await pollResponse.json();

      if (transcript.status === 'completed') {
        break;
      } else if (transcript.status === 'error') {
        return NextResponse.json({ error: transcript.error }, { status: 500 });
      }
    }

    // Fetch paragraphs for better formatting
    const paragraphsResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
    });

    const paragraphsData = paragraphsResponse.ok ? await paragraphsResponse.json() : null;

    return NextResponse.json({
      text: transcript.text,
      words: transcript.words || [],
      paragraphs: paragraphsData?.paragraphs || null,
      language: transcript.language_code,
      cached: false,
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

