"use client";

import { useEffect, useRef } from "react";

interface AudioTrack {
  id: number;
  language: string;
  label: string;
  active: boolean;
}

interface KalturaPlayer {
  currentTime: number;
  play: () => void;
  loadMedia: (mediaInfo: { entryId: string }) => Promise<void>;
  destroy: () => void;
  getTracks: (type?: string) => AudioTrack[];
  selectTrack: (track: AudioTrack) => void;
}

interface VideoPlayerProps {
  kalturaId: string;
  partnerId: number;
  uiConfId: number;
  audioLanguage?: string;
  onPlayerReady?: (player: KalturaPlayer) => void;
}

export function VideoPlayer({
  kalturaId,
  partnerId,
  uiConfId,
  audioLanguage,
  onPlayerReady,
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
    // Load Kaltura Player script
    const script = document.createElement("script");
    script.src = `https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${uiConfId}`;
    script.async = true;

    script.onload = () => {
      // Wait for KalturaPlayer to be available
      const checkPlayer = setInterval(() => {
        const windowWithKaltura = window as Window & {
          KalturaPlayer?: { setup: (config: unknown) => KalturaPlayer };
        };
        if (typeof windowWithKaltura.KalturaPlayer !== "undefined") {
          clearInterval(checkPlayer);
          initializePlayer();
        }
      }, 100);
    };

    document.body.appendChild(script);

    const initializePlayer = () => {
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
            audioLanguage: audioLanguage === "floor" ? "ia" : (audioLanguage || "en"),
          },
          ui: {
            locale: "en",
          },
        };

        const player = KalturaPlayerGlobal.setup(config);

        player.loadMedia({ entryId: kalturaId }).then(() => {
          playerRef.current = player;
          onPlayerReady?.(player);
        });
      } catch (error) {
        console.error("Failed to initialize Kaltura player:", error);
      }
    };

    return () => {
      if (playerRef.current) {
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
