import fs from 'fs';
import path from 'path';
import type { TranscriptionProvider, NormalizedTranscript } from './types';
import { downloadAudioToTemp } from '../utils';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

export const elevenlabs: TranscriptionProvider = {
  name: 'elevenlabs',

  async transcribe(audioUrl, opts) {
    const ownedPath = !opts?.audioFilePath;
    const filePath = opts?.audioFilePath || await downloadAudioToTemp(audioUrl, 'ElevenLabs');

    try {
      const fileData = fs.readFileSync(filePath);
      const blob = new Blob([fileData], { type: 'audio/mp4' });

      const form = new FormData();
      form.append('model_id', 'scribe_v2');
      form.append('file', blob, path.basename(filePath));
      form.append('diarize', 'true');
      form.append('timestamps_granularity', 'word');
      if (opts?.language) {
        form.append('language_code', opts.language);
      }

      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: form,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
      }

      const raw = await res.json() as {
        language_code?: string;
        text: string;
        words: Array<{
          text: string;
          start: number;
          end: number;
          type: string;
          speaker_id?: string;
        }>;
      };

      // Group consecutive word-type tokens by speaker_id into utterances
      const utterances: NormalizedTranscript['utterances'] = [];
      for (const word of raw.words) {
        if (word.type !== 'word') continue;
        const speaker = word.speaker_id || 'A';
        const last = utterances[utterances.length - 1];
        if (last && last.speaker === speaker) {
          last.end = word.end * 1000;
          last.text += ' ' + word.text;
        } else {
          utterances.push({
            speaker,
            start: word.start * 1000,
            end: word.end * 1000,
            text: word.text,
          });
        }
      }

      const durationMs = utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

      return {
        provider: 'elevenlabs',
        language: raw.language_code || opts?.language || 'en',
        fullText: raw.text,
        utterances,
        durationMs,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
