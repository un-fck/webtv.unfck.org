"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Play } from "lucide-react";
import {
  KALTURA_PARTNER_ID,
  KALTURA_UICONF_ID,
  kalturaThumbnailUrl,
} from "@/lib/kaltura";
import { cn } from "@/lib/utils";

interface KalturaPlayerInstance {
  currentTime: number;
  play: () => void;
  loadMedia: (mediaInfo: { entryId: string }) => Promise<void>;
  destroy: () => void;
}

type KalturaGlobal = {
  KalturaPlayer?: { setup: (config: unknown) => KalturaPlayerInstance };
};

// Load the playkit script once and resolve when the global is ready. Shared
// across every VideoMoment on the page.
let scriptPromise: Promise<void> | null = null;
function loadKalturaScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as KalturaGlobal).KalturaPlayer) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://cdnapisec.kaltura.com/p/${KALTURA_PARTNER_ID}/embedPlaykitJs/uiconf_id/${KALTURA_UICONF_ID}`;
    script.async = true;
    script.onload = () => {
      const start = Date.now();
      const tick = setInterval(() => {
        if ((window as KalturaGlobal).KalturaPlayer) {
          clearInterval(tick);
          resolve();
        } else if (Date.now() - start > 10000) {
          clearInterval(tick);
          reject(new Error("Kaltura player did not initialize"));
        }
      }, 100);
    };
    script.onerror = () => reject(new Error("Failed to load Kaltura script"));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * A still frame from the recording at the exact second the speaker is talking.
 * Clicking it mounts the live Kaltura player and seeks to that moment (via the
 * same `currentTime` API the main video page uses), so the page stays light
 * until a moment is actually opened.
 */
export function VideoMoment({
  entryId,
  startSeconds,
}: {
  entryId: string;
  startSeconds: number;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Stable, unique DOM id for this player target (playkit needs a real id).
  const targetId = `kmoment-${useId().replace(/[:]/g, "")}`;
  const playerRef = useRef<KalturaPlayerInstance | null>(null);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;

    loadKalturaScript()
      .then(() => {
        if (cancelled) return;
        const KP = (window as KalturaGlobal).KalturaPlayer;
        if (!KP) return;
        const player = KP.setup({
          targetId,
          provider: {
            partnerId: KALTURA_PARTNER_ID,
            uiConfId: KALTURA_UICONF_ID,
          },
          playback: { autoplay: true },
        });
        playerRef.current = player;
        return player.loadMedia({ entryId }).then(() => {
          if (cancelled) return;
          // Seek to the exact moment, then play — mirrors seekToTimestamp.
          try {
            player.currentTime = Math.max(0, Math.floor(startSeconds));
            player.play();
          } catch {
            // ignore
          }
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [playing, entryId, startSeconds, targetId]);

  if (playing) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div id={targetId} className="absolute inset-0 h-full w-full" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-muted"
      aria-label="Play this moment"
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // Offset the poster ~20s into the statement: the speaker is more
          // likely framed once they're underway. Playback still starts at the
          // true start (below).
          src={kalturaThumbnailUrl(entryId, startSeconds + 20)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-un-blue/30 to-un-blue/5" />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white",
            "backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-black/70",
          )}
        >
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        </span>
      </div>
      <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
        {formatClock(startSeconds)}
      </span>
    </button>
  );
}
