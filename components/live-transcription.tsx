"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface KalturaPlayer {
  currentTime: number;
  play: () => void;
}

interface LiveTranscriptionProps {
  player?: KalturaPlayer;
  kalturaId: string;
}

interface Turn {
  transcript: string;
  timestamp?: number;
}

export function LiveTranscription({ player }: LiveTranscriptionProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startStreaming = useCallback(async () => {
    if (!player || isStreaming) return;
    setError(null);
    player.play();
    setStatus("Connecting...");

    try {
      const response = await fetch("/api/stream-transcribe/token");
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to get authentication token");
      }

      const { token } = data;
      if (!token) throw new Error("No token received from server");

      const sampleRate = 16000;
      const params = new URLSearchParams({
        token,
        sample_rate: sampleRate.toString(),
        encoding: "pcm_s16le",
        format_turns: "true",
      });

      const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("Connected");
        setIsStreaming(true);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "Turn") {
          if (msg.end_of_turn && msg.turn_is_formatted) {
            setTurns((prev) => [
              ...prev,
              { transcript: msg.transcript, timestamp: player?.currentTime },
            ]);
            setCurrentTranscript("");
          } else {
            setCurrentTranscript(msg.transcript);
          }
        } else if (msg.type === "Begin") {
          setStatus("Transcribing...");
        } else if (msg.type === "Termination") {
          setStatus("Session ended");
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection failed");
        setStatus("");
      };

      ws.onclose = (event) => {
        if (event.code !== 1000) {
          setError(`Connection closed: ${event.reason || "Unknown reason"} (code: ${event.code})`);
        }
        setIsStreaming(false);
        setStatus("");
      };

      // Wait for video element
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (document.querySelector("video")) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

      const videoElement = document.querySelector("video") as HTMLVideoElement;
      if (!videoElement) throw new Error("Video player not ready.");

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaElementSource(videoElement);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        e.outputBuffer.getChannelData(0).set(inputData);

        if (ws.readyState === WebSocket.OPEN) {
          const targetLength = Math.floor((inputData.length * sampleRate) / audioContext.sampleRate);
          const pcm16 = new Int16Array(targetLength);
          for (let i = 0; i < targetLength; i++) {
            const src = Math.floor((i * inputData.length) / targetLength);
            pcm16[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[src] * 32768)));
          }
          ws.send(pcm16.buffer);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup audio capture");
      setStatus("");
      wsRef.current?.close();
    }
  }, [player, isStreaming]);

  const stopStreaming = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: "Terminate" })); } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setIsStreaming(false);
    setStatus("");
  }, []);

  useEffect(() => () => stopStreaming(), [stopStreaming]);

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Live Transcription</h3>
          {status && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {isStreaming && <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />}
              {status}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={isStreaming ? stopStreaming : startStreaming}
            disabled={!player}
            className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${isStreaming ? "bg-red-600 text-white hover:bg-red-700" : "bg-primary text-primary-foreground hover:opacity-90"}`}
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

      {(isStreaming || turns.length > 0) && (
        <div className="space-y-3">
          {turns.map((turn, i) => (
            <div key={i} className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed">
              {turn.timestamp !== undefined && (
                <span className="mr-2 text-xs text-muted-foreground">[{Math.floor(turn.timestamp)}s]</span>
              )}
              {turn.transcript}
            </div>
          ))}
          {currentTranscript && (
            <div className="rounded-lg border-2 border-primary/30 bg-muted/30 p-4 text-sm leading-relaxed italic text-muted-foreground">
              {currentTranscript}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
