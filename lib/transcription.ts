import { saveTranscript, deleteTranscriptsForEntry, getTursoClient } from './turso';

export async function getKalturaAudioUrl(kalturaId: string) {
  const apiResponse = await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      '1': { service: 'session', action: 'startWidgetSession', widgetId: '_2503451' },
      '2': {
        service: 'baseEntry',
        action: 'list',
        ks: '{1:result:ks}',
        filter: { redirectFromEntryId: kalturaId },
        responseProfile: { type: 1, fields: 'id,duration,objectType' },
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

  if (!apiResponse.ok) throw new Error('Failed to query Kaltura API');

  const apiData = await apiResponse.json();
  const entryId = apiData[1]?.objects?.[0]?.id;
  if (!entryId) throw new Error('No entry found');

  const flavors = apiData[2]?.objects || [];
  const englishCandidates = flavors.filter((f: { language?: string; tags?: string }) => 
    f.language?.toLowerCase() === 'english' && f.tags?.includes('audio_only')
  );
  const preferredFlavor = englishCandidates.find((f: { status?: number; isDefault?: boolean }) => f.status === 2 && f.isDefault)
    || englishCandidates.find((f: { status?: number }) => f.status === 2)
    || englishCandidates[0];
  const flavorParamId = preferredFlavor?.flavorParamsId || 100;
  
  return {
    entryId,
    audioUrl: `https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/${entryId}/format/download/protocol/https/flavorParamIds/${flavorParamId}`,
    flavorParamId,
    isLiveStream: apiData[1]?.objects?.[0]?.objectType === 'KalturaLiveStreamEntry',
  };
}

export async function submitTranscription(audioUrl: string) {
  const response = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'Authorization': process.env.ASSEMBLYAI_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      keyterms_prompt: ['UN80', 'Carolyn Schwalger', 'Brian Wallace', 'Guy Ryder'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to submit: ${error}`);
  }

  const data = await response.json();
  return data.id as string;
}

export async function pollTranscription(transcriptId: string): Promise<'completed' | 'processing' | 'error'> {
  const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
  });

  if (!pollResponse.ok) throw new Error('Failed to poll status');

  const transcript = await pollResponse.json();

  if (transcript.status === 'completed') {
    const client = await getTursoClient();
    const result = await client.execute({
      sql: 'SELECT entry_id, audio_url, start_time, end_time, status FROM transcripts WHERE transcript_id = ?',
      args: [transcriptId]
    });

    if (result.rows.length > 0) {
      const row = result.rows[0];
      
      if (row.status !== 'completed') {
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
        
        // Trigger speaker identification
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/identify-speakers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcriptId }),
        }).catch(() => {});
      }
    }

    // Check if speaker identification has completed
    const tursoResult = await client.execute({
      sql: 'SELECT content FROM transcripts WHERE transcript_id = ?',
      args: [transcriptId]
    });

    if (tursoResult.rows.length > 0) {
      const content = typeof tursoResult.rows[0].content === 'string' 
        ? JSON.parse(tursoResult.rows[0].content as string) 
        : tursoResult.rows[0].content;
      
      if (content.statements && content.statements.length > 0) {
        return 'completed';
      }
    }
    
    return 'processing'; // Speaker identification still running
  } else if (transcript.status === 'error') {
    return 'error';
  } else {
    return 'processing';
  }
}

export async function transcribeEntry(kalturaId: string, force = true) {
  const { entryId, audioUrl } = await getKalturaAudioUrl(kalturaId);
  
  if (force) {
    await deleteTranscriptsForEntry(entryId);
  }
  
  const transcriptId = await submitTranscription(audioUrl);
  
  await saveTranscript(
    entryId,
    transcriptId,
    null,
    null,
    audioUrl,
    'processing',
    null,
    { statements: [], topics: {} }
  );
  
  return { entryId, transcriptId };
}

