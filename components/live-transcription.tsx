"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface KalturaPlayer {
  currentTime: number;
  play: () => void;
}

interface LiveTranscriptionProps {
  player?: KalturaPlayer;
  isLive?: boolean;
  kalturaId: string;
}

interface Turn {
  transcript: string;
  turn_is_formatted: boolean;
  end_of_turn: boolean;
  timestamp?: number;
}

interface Word {
  text: string;
  speaker?: string | null;
  start: number;
  end: number;
}

interface Paragraph {
  text: string;
  start: number;
  end: number;
  words: Word[];
}

interface Gap {
  start: number;
  end: number;
}

export function LiveTranscription({
  player,
  kalturaId,
}: LiveTranscriptionProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [batchSegments, setBatchSegments] = useState<Paragraph[]>([]);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const backfillGaps = useCallback(
    async (gaps: Gap[]) => {
      setIsBackfilling(true);

      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        setBackfillProgress(
          `Transcribing segment ${i + 1}/${gaps.length}: ${Math.floor(gap.start)}s - ${Math.floor(gap.end)}s`,
        );

        try {
          // Submit transcription job for this gap
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kalturaId,
              startTime: gap.start,
              endTime: gap.end,
              totalDuration: gap.end,
            }),
          });

          if (!response.ok) {
            console.error(`Failed to transcribe gap ${gap.start}-${gap.end}`);
            continue;
          }

          const data = await response.json();

          // Check if this is a completed transcript (cached) or needs polling
          if (data.paragraphs) {
            // Cached transcript, handle immediately
            console.log(
              `Got cached transcription for gap ${gap.start}-${gap.end}:`,
              {
                paragraphCount: data.paragraphs?.length || 0,
              },
            );

            if (data.paragraphs.length > 0) {
              const adjustedParagraphs = data.paragraphs.map(
                (para: Paragraph) => ({
                  ...para,
                  start: para.start / 1000 + gap.start,
                  end: para.end / 1000 + gap.start,
                  words: para.words.map((w: Word) => ({
                    ...w,
                    start: w.start / 1000 + gap.start,
                    end: w.end / 1000 + gap.start,
                  })),
                }),
              );

              setBatchSegments((prev) =>
                [...prev, ...adjustedParagraphs].sort(
                  (a, b) => a.start - b.start,
                ),
              );
            }
          } else if (data.transcriptId) {
            // New transcript, poll for completion
            console.log(
              `Polling for transcript ${data.transcriptId} (gap ${gap.start}-${gap.end})`,
            );

            let pollCount = 0;
            const maxPolls = 200; // Max ~10 minutes (3s * 200)

            while (pollCount < maxPolls) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              pollCount++;

              const pollResponse = await fetch("/api/transcribe/poll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcriptId: data.transcriptId }),
              });

              if (!pollResponse.ok) {
                console.error(`Poll failed for ${data.transcriptId}`);
                break;
              }

              const pollData = await pollResponse.json();

              if (
                pollData.status === "completed" &&
                pollData.paragraphs &&
                pollData.paragraphs.length > 0
              ) {
                console.log(
                  `Transcription completed for gap ${gap.start}-${gap.end}`,
                );
                const adjustedParagraphs = pollData.paragraphs.map(
                  (para: Paragraph) => ({
                    ...para,
                    start: para.start / 1000 + gap.start,
                    end: para.end / 1000 + gap.start,
                    words: para.words.map((w: Word) => ({
                      ...w,
                      start: w.start / 1000 + gap.start,
                      end: w.end / 1000 + gap.start,
                    })),
                  }),
                );

                setBatchSegments((prev) =>
                  [...prev, ...adjustedParagraphs].sort(
                    (a, b) => a.start - b.start,
                  ),
                );
                break;
              } else if (pollData.status === "error") {
                console.error(
                  `Transcription error for gap ${gap.start}-${gap.end}:`,
                  pollData.error,
                );
                break;
              }

              // Still processing, continue polling
            }
          }
        } catch (err) {
          console.error(`Error transcribing gap ${gap.start}-${gap.end}:`, err);
        }
      }

      setIsBackfilling(false);
      setBackfillProgress("");
    },
    [kalturaId],
  );

  const startStreaming = useCallback(async () => {
    if (!player || isStreaming) return;
    setError(null);

    // Auto-play the video to enable audio capture
    player.play();

    setStatus("Checking existing transcripts...");

    // Start backfilling in parallel (don't await)
    (async () => {
      try {
        // Wait for video to seek to live position (poll until non-zero)
        let videoTime = 0;
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          videoTime = player.currentTime || 0;
          if (videoTime > 0) break;
        }
        console.log("Video current time for backfill:", videoTime);

        // Check for existing segments and gaps
        const segmentsResponse = await fetch("/api/transcribe/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kalturaId,
            currentTime: videoTime,
            totalDuration: videoTime,
            isComplete: false,
          }),
        });

        if (segmentsResponse.ok) {
          const segmentData = await segmentsResponse.json();

          // Load existing segments immediately
          if (
            segmentData.existingSegments &&
            segmentData.existingSegments.length > 0
          ) {
            console.log(
              "Loading existing segments:",
              segmentData.existingSegments.length,
            );
            setBatchSegments(segmentData.existingSegments);
          }

          if (segmentData.gaps && segmentData.gaps.length > 0) {
            console.log(
              `Found ${segmentData.gaps.length} gap(s) to transcribe`,
            );
            await backfillGaps(segmentData.gaps);
          }
        }
      } catch (err) {
        console.error("Failed to check/backfill segments:", err);
      }
    })();

    setStatus("Connecting...");

    try {
      // Get temporary token from server
      const response = await fetch("/api/stream-transcribe/token");
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to get authentication token");
      }

      const { token } = data;
      if (!token) {
        throw new Error("No token received from server");
      }

      const sampleRate = 16000;
      const params = new URLSearchParams({
        token: token,
        sample_rate: sampleRate.toString(),
        encoding: "pcm_s16le",
        format_turns: "true",
        keyterms: JSON.stringify([
          "UN80",
          "Carolyn Schwalger",
          "Brian Wallace",
          "Guy Ryder",
        ]),
      });

      const ws = new WebSocket(
        `wss://streaming.assemblyai.com/v3/ws?${params}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket opened successfully");
        setStatus("Connected");
        setIsStreaming(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("WebSocket message:", data);

        if (data.type === "Turn") {
          if (data.end_of_turn && data.turn_is_formatted) {
            setTurns((prev) => [
              ...prev,
              {
                transcript: data.transcript,
                turn_is_formatted: true,
                end_of_turn: true,
                timestamp: player?.currentTime,
              },
            ]);
            setCurrentTranscript("");
          } else {
            setCurrentTranscript(data.transcript);
          }
        } else if (data.type === "Begin") {
          setStatus("Transcribing...");
        } else if (data.type === "Termination") {
          setStatus("Session ended");
        }
      };

      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        setError(
          "WebSocket connection failed - check browser console for details",
        );
        setStatus("");
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        if (event.code !== 1000) {
          setError(
            `Connection closed: ${event.reason || "Unknown reason"} (code: ${event.code})`,
          );
        }
        setIsStreaming(false);
        setStatus("");
      };

      // Wait for video element to be ready
      await new Promise<void>((resolve) => {
        const checkVideo = setInterval(() => {
          const videoElement = document.querySelector("video");
          if (videoElement) {
            clearInterval(checkVideo);
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkVideo);
          resolve();
        }, 5000);
      });

      const videoElement = document.querySelector("video") as HTMLVideoElement;
      if (!videoElement) {
        throw new Error(
          "Video player not ready. Please wait for the video to load.",
        );
      }

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // Create media source from video
      const source = audioContext.createMediaElementSource(videoElement);
      sourceRef.current = source;

      // Create processor for resampling and sending audio
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect audio path: source -> processor -> destination (for playback)
      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const outputData = e.outputBuffer.getChannelData(0);

        // Pass audio through to output (for user to hear)
        outputData.set(inputData);

        // Send to WebSocket for transcription
        if (ws.readyState === WebSocket.OPEN) {
          // Resample to 16kHz and convert to PCM16
          const targetLength = Math.floor(
            (inputData.length * sampleRate) / audioContext.sampleRate,
          );
          const pcm16 = new Int16Array(targetLength);

          for (let i = 0; i < targetLength; i++) {
            const srcIndex = Math.floor((i * inputData.length) / targetLength);
            pcm16[i] = Math.max(
              -32768,
              Math.min(32767, Math.floor(inputData[srcIndex] * 32768)),
            );
          }

          ws.send(pcm16.buffer);
        }
      };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to setup audio capture",
      );
      setStatus("");
      if (wsRef.current) {
        wsRef.current.close();
      }
    }
  }, [player, isStreaming, kalturaId, backfillGaps]);

  const stopStreaming = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: "Terminate" }));
        wsRef.current.close();
      } catch (e) {
        console.error("Error closing WebSocket:", e);
      }
      wsRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsStreaming(false);
    setStatus("");
  }, []);

  const downloadTranscript = useCallback(() => {
    const text = turns
      .map((turn) => {
        const timestamp =
          turn.timestamp !== undefined
            ? `[${Math.floor(turn.timestamp)}s] `
            : "";
        return `${timestamp}${turn.transcript}`;
      })
      .join("\n\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `live-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [turns]);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Live Transcription</h3>
          {status && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isStreaming && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              )}
              {status}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {turns.length > 0 && (
            <button
              onClick={downloadTranscript}
              className="rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Download
            </button>
          )}
          <button
            onClick={isStreaming ? stopStreaming : startStreaming}
            disabled={!player}
            className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${
              isStreaming
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {isStreaming ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isBackfilling && (
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="font-medium">Loading past portion:</span>
            <span className="text-blue-600 dark:text-blue-400">
              {backfillProgress}
            </span>
          </div>
        </div>
      )}

      {(isStreaming || batchSegments.length > 0) && (
        <div className="space-y-3">
          {/* Display batch segments with clickable words */}
          {batchSegments.map((para, i) => {
            const paraStart = para.start;
            const hasWords = para.words && para.words.length > 0;

            return (
              <div key={`batch-${i}`} className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      player?.currentTime && (player.currentTime = paraStart)
                    }
                    className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
                    title="Jump to this timestamp"
                  >
                    [{Math.floor(paraStart)}s]
                  </button>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    Previous
                  </span>
                </div>
                <div className="rounded-lg border-2 border-transparent bg-muted/50 p-4">
                  <div className="text-sm leading-relaxed">
                    {hasWords ? (
                      <p>
                        {para.words.map((word, wordIndex) => (
                          <span
                            key={wordIndex}
                            onClick={() =>
                              player?.currentTime &&
                              (player.currentTime = word.start)
                            }
                            className="cursor-pointer transition-opacity hover:opacity-70"
                          >
                            {word.text}{" "}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p>{para.text}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Display live streaming turns (simpler, no word-level data) */}
          {turns.map((turn, i) => (
            <div key={`live-${i}`} className="space-y-2">
              <div className="flex items-center gap-2">
                {turn.timestamp !== undefined && (
                  <button
                    onClick={() =>
                      player?.currentTime &&
                      (player.currentTime = turn.timestamp!)
                    }
                    className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
                    title="Jump to this timestamp"
                  >
                    [{Math.floor(turn.timestamp)}s]
                  </button>
                )}
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-900 dark:text-green-300">
                  Live
                </span>
              </div>
              <div className="rounded-lg border-2 border-transparent bg-muted/50 p-4">
                <div className="text-sm leading-relaxed">{turn.transcript}</div>
              </div>
            </div>
          ))}

          {/* Display current streaming transcript */}
          {currentTranscript && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-900 dark:text-green-300">
                  Live
                </span>
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-4">
                <div className="text-sm leading-relaxed text-muted-foreground italic">
                  {currentTranscript}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
