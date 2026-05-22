import { useEffect, useRef } from "react";
import { scrollElementIntoView } from "@/lib/scroll-into-view";

/** Is the element within ~1.5–2.5 container/viewport heights of the top edge? */
function isRoughlyInView(el: HTMLElement): boolean {
  const container = el.closest(".overflow-y-auto");
  const viewport = container
    ? container.getBoundingClientRect()
    : { top: 0, height: window.innerHeight };
  const relativeTop = el.getBoundingClientRect().top - viewport.top;
  return (
    relativeTop > -viewport.height * 1.5 &&
    relativeTop < viewport.height * 2.5
  );
}

interface UseScrollToActiveOptions {
  /** Identifier of the active turn/paragraph; `null` (or `-1`) means none. */
  activeKey: string | number | null;
  /** Resolve the DOM element for a key (e.g. a ref lookup or querySelector). */
  getElement: (key: string | number) => HTMLElement | null;
  /** Ref holding the current playback time in seconds (for jump detection). */
  currentTimeRef: React.RefObject<number>;
  /**
   * When true, don't yank the view during continuous playback if the active
   * element has been scrolled far out of view (still snaps on jumps).
   */
  respectManualScroll?: boolean;
}

/**
 * Scroll the active turn/paragraph into view when it changes. Shared by the
 * verbatim-record (PV/SR) and transcript views so both scroll identically:
 * jumps (>5s time delta) snap instantly, continuous playback scrolls smoothly,
 * and each key is only scrolled to once. See {@link scrollElementIntoView}.
 */
export function useScrollToActive({
  activeKey,
  getElement,
  currentTimeRef,
  respectManualScroll = false,
}: UseScrollToActiveOptions) {
  const lastKey = useRef<string | number | null>(null);
  const lastTime = useRef(0);
  // Keep the latest getElement without making it an effect dependency, so the
  // scroll effect runs only when activeKey changes.
  const getElementRef = useRef(getElement);
  useEffect(() => {
    getElementRef.current = getElement;
  });

  useEffect(() => {
    if (activeKey === null || activeKey === -1) return;
    if (lastKey.current === activeKey) return;

    const el = getElementRef.current(activeKey);
    if (!el) return;

    const time = currentTimeRef.current ?? 0;
    const isJump = Math.abs(time - lastTime.current) > 5;
    lastTime.current = time;

    if (respectManualScroll && !isJump && !isRoughlyInView(el)) return;

    scrollElementIntoView(el, isJump ? "instant" : "smooth");
    lastKey.current = activeKey;
  }, [activeKey, currentTimeRef, respectManualScroll]);
}
