import type { TranscriptionProvider } from "./types";
import { apiLanguage } from "./utils";
import { transcribeViaFiletrans } from "./dashscope-asr";

// Fun-ASR via DashScope async file transcription: diarization + sentence/word
// timestamps. Text is rebuilt from word-level tokens (see joinWords) to repair
// the Mandarin-first model's run-together English spacing.
export const funAsr: TranscriptionProvider = {
  name: "alibaba-fun-asr",
  label: "Alibaba Fun-ASR",
  model: "fun-asr",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: true,
  },
  async transcribe(audioUrl, opts) {
    const lang = apiLanguage(opts?.language);
    return transcribeViaFiletrans(
      "alibaba-fun-asr",
      "fun-asr",
      { file_urls: [audioUrl] },
      {
        timestamp_alignment_enabled: true,
        enable_words: true,
        diarization_enabled: true,
        ...(lang ? { language_hints: [lang] } : {}),
      },
      opts?.language || "en",
    );
  },
};
