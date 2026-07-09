/**
 * Recognises unhandled promise rejections that originate inside the Kaltura
 * player rather than in our own code.
 *
 * Why this exists: the Kaltura wrapper's `play()` is literally
 * `function(){ this._localPlayer.play() }` — it starts the underlying
 * `HTMLMediaElement.play()` but neither returns nor catches the promise that
 * call produces. When that promise rejects — the browser's autoplay policy
 * (`NotAllowedError`), or a transient Kaltura media error raised while seeking
 * — nothing owns it, so it surfaces as a stackless `unhandledrejection`.
 *
 * Our own `player.play()` call site therefore has no promise to `.catch()`
 * (the wrapper returns `undefined`); the only place we can intervene is the
 * global `unhandledrejection` event. `components/video-player.tsx` installs a
 * listener for the player's lifetime that calls `preventDefault()` on the
 * values matched here, which marks the rejection handled and keeps it out of
 * the console. Playback is unaffected either way — the player recovers on the
 * next gesture or seek.
 *
 * This mirrors the intent already documented on `reportKalturaError`: Kaltura's
 * own error events are logged, never forwarded to Sentry. The unhandled
 * rejection was the one path that bypassed that decision.
 *
 * Sentry issues: TRANSCRIPTS-D (Kaltura error object), 29 / 2P (autoplay
 * `NotAllowedError`), 2S (`CustomEvent`).
 *
 * Deliberately NOT matched: a bare `{}` rejection (TRANSCRIPTS-2R). It carries
 * no payload we can attribute to the player, and swallowing every empty-object
 * rejection could mask a genuine bug. `lib/sentry-filter.ts` drops that one
 * from *reporting* only, which is the safer half-measure.
 *
 * Pure apart from the `instanceof Event` check, so it is unit-testable.
 */

// playkit-js rejects with an error object carrying exactly these keys.
const KALTURA_ERROR_KEYS = [
  "category",
  "code",
  "data",
  "errorDetails",
  "severity",
] as const;

// Autoplay-policy DOMException messages raised by `HTMLMediaElement.play()`.
// Matched on the message, never on the bare `NotAllowedError` type — that same
// type is thrown by unrelated permission-gated Web APIs.
const AUTOPLAY_MESSAGES = [
  "play method is not allowed by the user agent",
  "request is not allowed by the user agent or the platform",
];

export function isKalturaPlayerRejection(reason: unknown): boolean {
  if (reason === null || typeof reason !== "object") return false;

  // Rejected with a DOM Event (Kaltura dispatches FakeEvent/CustomEvent).
  // Application code never rejects a promise with an Event.
  if (typeof Event !== "undefined" && reason instanceof Event) return true;

  const record = reason as Record<string, unknown>;

  // Autoplay-policy DOMException from the media element's play().
  const message = record.message;
  if (
    record.name === "NotAllowedError" &&
    typeof message === "string" &&
    AUTOPLAY_MESSAGES.some((marker) => message.includes(marker))
  ) {
    return true;
  }

  // playkit-js error object: { category, code, data, errorDetails, severity }.
  if (KALTURA_ERROR_KEYS.every((key) => key in record)) return true;

  return false;
}
