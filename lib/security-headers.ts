// Baseline HTTP security headers applied to every response via next.config
// `headers()`. Verified to reach all route types including locale-routed HTML
// pages and the middleware-rewritten `.json`/`.txt` data API, so proxy.ts does
// NOT re-apply them (doing so would emit duplicate headers).
//
// This is deliberately the "cannot break functionality" set — no
// Content-Security-Policy. It hardens clickjacking, MIME-sniffing, referrer
// leakage, transport security, and browser-feature access without restricting
// any script/style/frame origin the app depends on (Kaltura player, Umami,
// Swagger UI). A CSP is a separate, staged effort (report-only first) because
// a wrong policy breaks the embedded Kaltura player.
//
// Notes on specific values:
//   - HSTS: 2 years + includeSubDomains. `preload` is intentionally omitted —
//     enrolling on the browser preload list is a hard-to-reverse, org-level
//     decision for the un.org namespace, not something to bake in unilaterally.
//   - Permissions-Policy denies camera/microphone/geolocation/browsing-topics
//     only. It intentionally does NOT restrict fullscreen/autoplay/encrypted-
//     media, which the Kaltura video player relies on (those stay at the
//     default `self`).
//   - X-Frame-Options governs who may frame *us* (clickjacking). It does not
//     affect us embedding Kaltura's iframe as a child.
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

/** Shape expected by `next.config.ts` `headers()`. */
export const securityHeaderList = Object.entries(SECURITY_HEADERS).map(
  ([key, value]) => ({ key, value }),
);
