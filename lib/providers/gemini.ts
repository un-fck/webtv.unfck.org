import fs from "fs";
import type { TranscriptionProvider, NormalizedTranscript } from "./types";
import { downloadAudioToTemp } from "./utils";
import {
  GEMINI_API_KEY,
  GEMINI_MODEL as MODEL,
  GEMINI_BASE as BASE,
  httpsPostJson,
  uploadFileToGemini,
  waitForGeminiFile,
  deleteGeminiFile,
  parseHHMMSSToMs,
} from "../gemini-utils";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  ar: "Arabic",
  zh: "Chinese",
  ru: "Russian",
};

interface GeminiSegment {
  speaker: string;
  timestamp: string;
  content: string;
}

export const gemini: TranscriptionProvider = {
  name: "gemini",
  capabilities: {
    speakerIdentification: false,
    paragraphSegmentation: false,
    wordTimestamps: false,
  },

  async transcribe(audioUrl, opts) {
    const lang = opts?.language || "en";
    const langName = LANGUAGE_NAMES[lang] || lang;

    // Get local audio file
    const ownedPath = !opts?.audioFilePath;
    const filePath =
      opts?.audioFilePath || (await downloadAudioToTemp(audioUrl, "Gemini"));

    try {
      // Upload to Gemini Files API
      console.log(`  [Gemini] Uploading audio...`);
      const file = await uploadFileToGemini(filePath, "eval");
      console.log(`  [Gemini] File uploaded: ${file.name}`);

      // Wait for processing
      console.log(`  [Gemini] File URI: ${file.uri}`);
      await waitForGeminiFile(file.name, true);

      // Generate transcription with structured diarization output
      console.log(`  [Gemini] Transcribing with ${MODEL}...`);
      const requestBody = {
        contents: [
          {
            parts: [
              { fileData: { mimeType: "audio/mp4", fileUri: file.uri } },
              {
                text: [
                  `Transcribe this audio recording verbatim in ${langName}.`,
                  "",
                  "Requirements:",
                  "1. Identify distinct speakers (Speaker 1, Speaker 2, etc.).",
                  "2. Provide timestamps for each segment (Format: MM:SS).",
                  "3. Transcribe every word exactly as spoken — do not correct grammar, summarize, or paraphrase.",
                  "4. Include filler words, false starts, and repetitions.",
                  "5. This is a United Nations session — preserve all speaker statements faithfully.",
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 65536,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              segments: {
                type: "ARRAY",
                description:
                  "List of transcribed segments with speaker and timestamp.",
                items: {
                  type: "OBJECT",
                  properties: {
                    speaker: {
                      type: "STRING",
                      description: "Speaker identifier (e.g. Speaker 1)",
                    },
                    timestamp: {
                      type: "STRING",
                      description: "Timestamp in MM:SS format",
                    },
                    content: {
                      type: "STRING",
                      description: "Verbatim transcription of this segment",
                    },
                  },
                  required: ["speaker", "timestamp", "content"],
                },
              },
            },
            required: ["segments"],
          },
        },
      };

      const apiUrl = `${BASE}/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const result = await httpsPostJson(apiUrl, requestBody);

      if (result.status !== 200) {
        throw new Error(
          `Gemini API error ${result.status}: ${result.body.slice(0, 500)}`,
        );
      }

      const raw = JSON.parse(result.body) as any;
      const responseText = (raw.candidates?.[0]?.content?.parts || [])
        .map((p: any) => p.text || "")
        .join("")
        .trim();

      if (!responseText) {
        throw new Error(
          `Gemini returned empty transcription: ${JSON.stringify(raw.candidates?.[0]?.finishReason)}`,
        );
      }

      // Parse structured JSON response
      const parsed = JSON.parse(responseText) as { segments: GeminiSegment[] };
      const segments = parsed.segments || [];

      // Build utterances from segments
      const utterances: NormalizedTranscript["utterances"] = [];
      for (const seg of segments) {
        const startMs = parseHHMMSSToMs(seg.timestamp);
        const last = utterances[utterances.length - 1];
        if (last && last.speaker === seg.speaker) {
          last.end = startMs;
          last.text += " " + seg.content;
        } else {
          utterances.push({
            speaker: seg.speaker.replace(/^Speaker\s*/i, ""),
            start: startMs,
            end: startMs,
            text: seg.content,
          });
        }
      }

      // Set end times: each utterance ends when the next starts
      for (let i = 0; i < utterances.length - 1; i++) {
        if (utterances[i].end <= utterances[i].start) {
          utterances[i].end = utterances[i + 1].start;
        }
      }

      const fullText = segments
        .map((s) => s.content)
        .join(" ")
        .trim();
      const durationMs =
        utterances.length > 0 ? utterances[utterances.length - 1].end : 0;

      console.log(
        `  [Gemini] Transcription: ${fullText.length} chars, ${segments.length} segments, ${utterances.length} utterances`,
      );

      // Clean up uploaded file
      await deleteGeminiFile(file.name);

      return {
        provider: "gemini",
        language: lang,
        fullText,
        utterances,
        durationMs,
        raw,
      } satisfies NormalizedTranscript;
    } finally {
      if (ownedPath) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  },
};
