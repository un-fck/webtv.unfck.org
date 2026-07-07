// Install the browser-only globals that pdfjs-dist references at module load.
//
// pdfjs-dist's legacy build evaluates `const SCALE_MATRIX = new DOMMatrix()` at
// the *top level* of `pdf.mjs`, and only polyfills DOMMatrix/ImageData/Path2D
// in Node from its OPTIONAL `@napi-rs/canvas` dependency. Next's `standalone`
// output does not trace that optional dep into the server bundle, so on the
// deployed container `@napi-rs/canvas` is missing, the polyfill is skipped, and
// `pdf.mjs` throws `ReferenceError: DOMMatrix is not defined` during evaluation.
// Because that happens at import time, it crashes the ENTIRE `/api/pv` route
// module — every request 500s, even cache hits and validation errors — while
// `next dev` (which resolves the full node_modules where the optional dep is
// present) works fine. That divergence is exactly the "loads on localhost, not
// on prod" symptom.
//
// Importing `@napi-rs/canvas` explicitly here does two things:
//   1. pulls it — and its platform binary — into the standalone file trace, and
//   2. lets us install the globals deterministically, independent of pdfjs's
//      own optional-require path.
//
// This module MUST be imported before any pdfjs module so the globals exist
// before `pdf.mjs` evaluates. See lib/pv-parser.ts.
import * as canvas from "@napi-rs/canvas";

const g = globalThis as unknown as Record<string, unknown>;
g.DOMMatrix ??= canvas.DOMMatrix;
g.ImageData ??= canvas.ImageData;
g.Path2D ??= canvas.Path2D;
