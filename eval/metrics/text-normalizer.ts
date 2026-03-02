import { FILLER_WORDS } from '../config';

/** Normalize text for fair WER comparison between ASR output and edited verbatim records */
export function normalizeForWER(text: string, language = 'en'): string {
  let normalized = text.toLowerCase();

  // Remove punctuation (keep apostrophes inside words)
  normalized = normalized.replace(/[^\p{L}\p{N}\s''-]/gu, ' ');

  // Remove filler words
  const fillers = FILLER_WORDS[language] || FILLER_WORDS.en;
  for (const filler of fillers) {
    normalized = normalized.replace(new RegExp(`\\b${filler}\\b`, 'gi'), ' ');
  }

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}
