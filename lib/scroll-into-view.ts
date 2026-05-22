/**
 * Scroll an element into view aligned to the top of its scroll container.
 *
 * The browser computes the target natively, so this is robust to nested
 * scrollers and in-flight smooth animations (unlike hand-computed
 * `scrollTop` math, which can read a transient mid-animation position and
 * overshoot). Control the gap below the top edge declaratively with a
 * `scroll-mt-*` (scroll-margin-top) class on the target element.
 *
 * Shared by the verbatim-record (PV/SR) and transcript views so a clicked or
 * playback-active turn/paragraph always lands at the same position.
 */
export function scrollElementIntoView(
  el: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  el.scrollIntoView({ block: "start", behavior });
}
