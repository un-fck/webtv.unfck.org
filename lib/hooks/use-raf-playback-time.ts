"use client";

import { useEffect, useRef } from "react";

/**
 * Drive a requestAnimationFrame loop off a media player's clock.
 *
 * Polls `player.currentTime` each frame and, when it changes by more than
 * ~10ms, updates the returned `currentTimeRef` and invokes `onTime(seconds)`.
 * Consumers do their own (domain-specific) active-index computation in the
 * callback; this just owns the loop scaffolding shared by the transcript and
 * verbatim-record trackers.
 *
 * `onTime` may close over changing data (segments, turns, …) — it's held in a
 * ref so the loop isn't torn down and re-subscribed on every render; only a
 * change of `player` restarts it. Pass `undefined` for `player` to disable.
 */
export function useRafPlaybackTime(
  player: { currentTime: number } | undefined | null,
  onTime: (seconds: number) => void,
): React.RefObject<number> {
  const currentTimeRef = useRef<number>(0);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onTimeRef.current = onTime;
  });

  useEffect(() => {
    if (!player) return;

    let rafId: number;
    let lastTime = -1;

    const tick = () => {
      try {
        const time = player.currentTime;
        if (Math.abs(time - lastTime) > 0.01) {
          lastTime = time;
          currentTimeRef.current = time;
          onTimeRef.current(time);
        }
      } catch {
        // player not ready / detached — keep polling
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [player]);

  return currentTimeRef;
}
