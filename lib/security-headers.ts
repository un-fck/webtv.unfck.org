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

// CORS for the public, unauthenticated data surface (the .json/.txt data API,
// /llms*.txt, /openapi.json) so browser code on other origins — e.g. a static
// GitHub Pages site — can fetch it directly instead of proxying through a
// server. Safe because these endpoints read no cookies and return identical
// bytes for every requester; with a wildcard origin, browsers never attach
// credentials. Deliberately a static `*` rather than reflecting the request
// Origin: responses are CDN-cached without Origin in the cache key, so a
// reflected value could be cached and served to the wrong origin (and `Vary:
// Origin` would just fragment the cache for no benefit here).
//
// NOT part of SECURITY_HEADERS / the global `headers()` source: the
// authenticated routes (/api/transcripts POST, /api/subscriptions, …) must not
// advertise cross-origin readability, even though the wildcard-vs-credentials
// rule would make it inert there.
export const PUBLIC_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
};

/** Shape expected by `next.config.ts` `headers()`. */
export const publicCorsHeaderList = Object.entries(PUBLIC_CORS_HEADERS).map(
  ([key, value]) => ({ key, value }),
);
