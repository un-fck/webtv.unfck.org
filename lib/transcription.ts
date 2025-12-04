import { 
  saveTranscript, deleteTranscriptsForEntry, getTranscriptById,
  updateTranscriptStatus, tryAcquirePipelineLock, releasePipelineLock,
  type TranscriptStatus, type TranscriptContent, type RawParagraph
} from './turso';
import { identifySpeakers } from './speaker-identification';

export { type TranscriptStatus } from './turso';

export interface PollResult {
  stage: TranscriptStatus;
  raw_paragraphs?: RawParagraph[];
  statements?: TranscriptContent['statements'];
  topics?: TranscriptContent['topics'];
  error_message?: string;
}

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

async function fetchAssemblyAIParagraphs(transcriptId: string): Promise<RawParagraph[]> {
  const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`, {
    headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
  });
  if (!response.ok) throw new Error('Failed to fetch paragraphs from AssemblyAI');
  const data = await response.json();
  return data.paragraphs;
}

export async function pollTranscription(transcriptId: string): Promise<PollResult> {
  // First check our database status
  const transcript = await getTranscriptById(transcriptId);
  if (!transcript) throw new Error('Transcript not found');

  // If already completed, return the data
  if (transcript.status === 'completed') {
    return {
      stage: 'completed',
      raw_paragraphs: transcript.content.raw_paragraphs,
      statements: transcript.content.statements,
      topics: transcript.content.topics,
    };
  }

  // If error, return error with available data
  if (transcript.status === 'error') {
    return {
      stage: 'error',
      error_message: transcript.error_message || 'Unknown error',
      raw_paragraphs: transcript.content.raw_paragraphs,
      statements: transcript.content.statements,
      topics: transcript.content.topics,
    };
  }

  // If in a later stage, return current progress
  if (transcript.status === 'identifying_speakers' || transcript.status === 'analyzing_topics') {
    return {
      stage: transcript.status,
      raw_paragraphs: transcript.content.raw_paragraphs,
      statements: transcript.content.statements,
      topics: transcript.content.topics,
    };
  }

  // If transcribed but pipeline not running, check if we should start it
  if (transcript.status === 'transcribed') {
    // Try to acquire lock and start pipeline
    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (acquired) {
      // Start pipeline in background (don't await)
      runPipeline(transcriptId, transcript.entry_id).catch(err => {
        console.error('Pipeline error:', err);
        updateTranscriptStatus(transcriptId, 'error', err instanceof Error ? err.message : 'Pipeline failed');
        releasePipelineLock(transcriptId);
      });
    }
    return {
      stage: 'identifying_speakers',
      raw_paragraphs: transcript.content.raw_paragraphs,
    };
  }

  // Still transcribing - check AssemblyAI
  const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
  });
  if (!pollResponse.ok) throw new Error('Failed to poll AssemblyAI');

  const assemblyData = await pollResponse.json();

  if (assemblyData.status === 'completed') {
    // Fetch paragraphs and save to DB
    const rawParagraphs = await fetchAssemblyAIParagraphs(transcriptId);
    const content: TranscriptContent = { raw_paragraphs: rawParagraphs, statements: [], topics: {} };
    
    await saveTranscript(
      transcript.entry_id,
      transcriptId,
      transcript.start_time,
      transcript.end_time,
      transcript.audio_url,
      'transcribed',
      assemblyData.language_code,
      content
    );

    // Try to start the pipeline
    const acquired = await tryAcquirePipelineLock(transcriptId);
    if (acquired) {
      runPipeline(transcriptId, transcript.entry_id).catch(err => {
        console.error('Pipeline error:', err);
        updateTranscriptStatus(transcriptId, 'error', err instanceof Error ? err.message : 'Pipeline failed');
        releasePipelineLock(transcriptId);
      });
    }

    return { stage: 'identifying_speakers', raw_paragraphs: rawParagraphs };
  } else if (assemblyData.status === 'error') {
    await updateTranscriptStatus(transcriptId, 'error', assemblyData.error || 'AssemblyAI transcription failed');
    return { stage: 'error', error_message: assemblyData.error };
  }

  return { stage: 'transcribing' };
}

async function runPipeline(transcriptId: string, _entryId: string) {
  try {
    await updateTranscriptStatus(transcriptId, 'identifying_speakers');
    
    // Fetch paragraphs from our stored data
    const transcript = await getTranscriptById(transcriptId);
    if (!transcript?.content.raw_paragraphs) {
      throw new Error('No raw paragraphs available');
    }

    // Run speaker identification (this also does topic analysis internally and saves to DB)
    await identifySpeakers(transcript.content.raw_paragraphs, transcriptId);
    
    // Mark as completed
    await updateTranscriptStatus(transcriptId, 'completed');
    await releasePipelineLock(transcriptId);
  } catch (err) {
    console.error('Pipeline failed:', err);
    await updateTranscriptStatus(transcriptId, 'error', err instanceof Error ? err.message : 'Pipeline failed');
    await releasePipelineLock(transcriptId);
    throw err;
  }
}

export async function transcribeEntry(kalturaId: string, force = true) {
  const { entryId, audioUrl } = await getKalturaAudioUrl(kalturaId);
  
  if (force) {
    await deleteTranscriptsForEntry(entryId);
  }
  
  const transcriptId = await submitTranscription(audioUrl);
  
  await saveTranscript(entryId, transcriptId, null, null, audioUrl, 'transcribing', null, { statements: [], topics: {} });
  
  return { entryId, transcriptId };
}
