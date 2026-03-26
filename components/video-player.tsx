"use client";

import { useEffect, useRef } from "react";

interface KalturaPlayer {
  currentTime: number;
  play: () => void;
  loadMedia: (mediaInfo: { entryId: string }) => Promise<void>;
  destroy: () => void;
}

interface VideoPlayerProps {
  kalturaId: string;
  partnerId: number;
  uiConfId: number;
  onPlayerReady?: (player: KalturaPlayer) => void;
}

export function VideoPlayer({
  kalturaId,
  partnerId,
  uiConfId,
  onPlayerReady,
}: VideoPlayerProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<KalturaPlayer | null>(null);

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
            audioLanguage: "en",
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
