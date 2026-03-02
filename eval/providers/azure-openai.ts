import { AzureOpenAI } from 'openai';
import fs from 'fs';
import type { TranscriptionProvider, NormalizedTranscript } from './types';
import { downloadAudioToTemp } from '../utils';

export const azureOpenai: TranscriptionProvider = {
  name: 'azure-openai',

  async transcribe(audioUrl, opts) {
    // Azure requires a local file upload, not a URL
    const ownedPath = !opts?.audioFilePath;
    const tmpPath = opts?.audioFilePath || await downloadAudioToTemp(audioUrl, 'Azure');

    try {
      const client = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      });

      const response = await client.audio.transcriptions.create({
        model: 'gpt-4o-transcribe-diarize',
        file: fs.createReadStream(tmpPath),
        response_format: 'diarized_json',
        chunking_strategy: 'auto',
      } as any);

      const raw = response as any;

      // Group consecutive segments by speaker into turns
      const utterances: NormalizedTranscript['utterances'] = [];
      if (raw.segments && Array.isArray(raw.segments)) {
        for (const seg of raw.segments) {
          const last = utterances[utterances.length - 1];
          if (last && last.speaker === seg.speaker) {
            last.end = seg.end * 1000;
            last.text += ' ' + seg.text.trim();
          } else {
            utterances.push({
              speaker: seg.speaker,
              start: seg.start * 1000,
              end: seg.end * 1000,
              text: seg.text.trim(),
            });
          }
        }
      }

      const fullText = utterances.map(u => u.text).join(' ');
      const durationMs = utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

      return {
        provider: 'azure-openai',
        language: opts?.language || 'en',
        fullText,
        utterances,
        durationMs,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }
  },
};
