"use client";

import { useEffect, useRef } from "react";

interface AudioTrack {
  id: number;
  language: string;
  label: string;
  active: boolean;
}

type KalturaErrorEvent = { payload?: unknown; type?: string };

interface KalturaPlayer {
  currentTime: number;
  play: () => void;
  loadMedia: (mediaInfo: { entryId: string }) => Promise<void>;
  destroy: () => void;
  getTracks: (type?: string) => AudioTrack[];
  selectTrack: (track: AudioTrack) => void;
  addEventListener: (
    type: string,
    handler: (event: KalturaErrorEvent) => void,
  ) => void;
  removeEventListener: (
    type: string,
    handler: (event: KalturaErrorEvent) => void,
  ) => void;
}

// Kaltura emits errors as plain objects like { category, code, data, severity }.
// We log to the console for local debugging but do NOT forward to Sentry: the
// category=3 (MEDIA) family is almost entirely user-side noise (network,
// ad-blocker, geoblock, codec) that we can't act on, and users who hit an
// actually-broken player report via the feedback widget with more context than
// an anonymous error would carry.
function reportKalturaError(source: string, payload: unknown) {
  console.warn(`[kaltura] ${source}`, payload);
}

interface VideoPlayerProps {
  kalturaId: string;
  partnerId: number;
  uiConfId: number;
  audioLanguage?: string;
  onPlayerReady?: (player: KalturaPlayer) => void;
  onAudioTracksReady?: (tracks: AudioTrack[]) => void;
}

export function VideoPlayer({
  kalturaId,
  partnerId,
  uiConfId,
  audioLanguage,
  onPlayerReady,
  onAudioTracksReady,
}: VideoPlayerProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<KalturaPlayer | null>(null);

  // Map our language codes to Kaltura player audio track language codes.
  // Kaltura uses "ia" (Interlingua) for the floor/original audio channel.
  const FLOOR_TRACK_CODES = new Set(["ia"]);

  // Switch audio track when audioLanguage prop changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !audioLanguage) return;

    try {
      const audioTracks = player.getTracks("audio");

      let target: AudioTrack | undefined;

      if (audioLanguage === "floor") {
        // Floor channel is labeled "Interlingua" (ia) in Kaltura
        target = audioTracks.find(
          (t) => !t.active && FLOOR_TRACK_CODES.has(t.language),
        );
        // Fallback: try label-based matching
        if (!target) {
          target = audioTracks.find(
            (t) =>
              !t.active &&
              (t.label.toLowerCase().includes("floor") ||
                t.label.toLowerCase().includes("original") ||
                t.label.toLowerCase().includes("interlingua")),
          );
        }
      } else {
        target = audioTracks.find(
          (t) => t.language === audioLanguage && !t.active,
        );
      }

      if (target) {
        player.selectTrack(target);
      }
    } catch (err) {
      console.log("Failed to switch audio track:", err);
    }
  }, [audioLanguage]);

  useEffect(() => {
    // Guards so a teardown that races the async setup doesn't leave the player
    // container bound (which makes the next setup() throw "target id already in
    // use"). `cancelled` short-circuits work scheduled before cleanup ran;
    // `checkPlayer` is tracked so the readiness poll is cleared on cleanup.
    let cancelled = false;
    let checkPlayer: ReturnType<typeof setInterval> | undefined;
    let errorListener: ((event: KalturaErrorEvent) => void) | undefined;

    // Wait for window.KalturaPlayer (set by the SDK script), then init.
    const waitForPlayer = () => {
      if (cancelled) return;
      checkPlayer = setInterval(() => {
        const windowWithKaltura = window as Window & {
          KalturaPlayer?: { setup: (config: unknown) => KalturaPlayer };
        };
        if (typeof windowWithKaltura.KalturaPlayer !== "undefined") {
          clearInterval(checkPlayer);
          checkPlayer = undefined;
          initializePlayer();
        }
      }, 100);
    };

    // Load the SDK script once and reuse it across mounts. Appending a fresh
    // <script> on every mount leaked tags and re-ran the SDK bootstrap; the
    // global window.KalturaPlayer it installs is shared anyway.
    const scriptSrc = `https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${uiConfId}`;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptSrc}"]`,
    );
    if (existing) {
      waitForPlayer();
    } else {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.async = true;
      script.onload = waitForPlayer;
      document.body.appendChild(script);
    }

    const initializePlayer = () => {
      if (cancelled) return;
      try {
        const windowWithKaltura = window as Window & {
          KalturaPlayer?: { setup: (config: unknown) => KalturaPlayer };
        };
        const KalturaPlayerGlobal = windowWithKaltura.KalturaPlayer;
        if (!KalturaPlayerGlobal) return;

        // Destroy any existing player instance before setting up a new one
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore
          }
          playerRef.current = null;
        }

        const config = {
          targetId: "kaltura-player-container",
          provider: {
            partnerId: partnerId,
            uiConfId: uiConfId,
          },
          playback: {
            audioLanguage:
              audioLanguage === "floor" ? "ia" : audioLanguage || "en",
          },
          ui: {
            locale: "en",
          },
        };

        const player = KalturaPlayerGlobal.setup(config);
        // Track the instance immediately so cleanup can destroy it even if the
        // loadMedia promise below hasn't resolved yet.
        playerRef.current = player;

        errorListener = (event) => {
          reportKalturaError("error-event", event?.payload ?? event);
        };
        try {
          player.addEventListener("error", errorListener);
        } catch {
          errorListener = undefined;
        }

        player
          .loadMedia({ entryId: kalturaId })
          .then(() => {
            if (cancelled) return;
            onPlayerReady?.(player);

            // Report audio tracks, retrying until the HLS manifest is parsed
            const tryReportTracks = (retries = 5) => {
              if (cancelled) return;
              try {
                const tracks = player.getTracks("audio");
                if (tracks.length > 0) {
                  onAudioTracksReady?.(tracks);
                } else if (retries > 0) {
                  setTimeout(() => tryReportTracks(retries - 1), 1000);
                }
              } catch {
                // ignore
              }
            };
            tryReportTracks();
          })
          .catch((err) => {
            if (cancelled) return;
            reportKalturaError("loadMedia", err);
          });
      } catch (error) {
        console.error("Failed to initialize Kaltura player:", error);
      }
    };

    return () => {
      cancelled = true;
      if (checkPlayer) {
        clearInterval(checkPlayer);
        checkPlayer = undefined;
      }
      if (playerRef.current) {
        if (errorListener) {
          try {
            playerRef.current.removeEventListener("error", errorListener);
          } catch {
            // ignore
          }
          errorListener = undefined;
        }
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [kalturaId, partnerId, uiConfId, onPlayerReady]);

  return (
    <div
      id="kaltura-player-container"
      ref={playerContainerRef}
      className="h-full w-full"
      style={{ aspectRatio: "16/9" }}
    />
  );
}
