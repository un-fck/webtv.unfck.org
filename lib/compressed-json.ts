import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

// Below this the gzip overhead exceeds the savings.
const MIN_SIZE_TO_COMPRESS = 1024;

/**
 * Build a JSON Response whose body is gzipped when the client accepts it.
 *
 * Why this helper exists: Next.js's `compress: true` (default) only applies
 * to HTML routes — App Router route handlers return a Web Response, which
 * bypasses the Node-side `compression` middleware. So a `NextResponse.json`
 * for a multi-MB payload ships uncompressed on the wire, no Content-Encoding
 * header.  Verified in dev: HTML pages get `Content-Encoding: gzip`,
 * /api/transcripts/check ships 4.4 MB plain.
 *
 * Use this in place of `NextResponse.json(...)` on any handler returning a
 * payload larger than a few KB. Honors the request's `Accept-Encoding`, sets
 * `Vary: Accept-Encoding` so caches don't serve gzipped bodies to clients
 * that didn't ask for them.
 */
export async function compressedJson(
  request: Request,
  data: unknown,
  init?: ResponseInit,
): Promise<Response> {
  return compressedBody(
    request,
    JSON.stringify(data),
    "application/json; charset=utf-8",
    init,
  );
}

/**
 * Plain-text counterpart to `compressedJson`. Used by the data API's text
 * format (a long transcript renders to tens to hundreds of KB plain text
 * that compresses excellently).
 */
export async function compressedText(
  request: Request,
  body: string,
  init?: ResponseInit,
): Promise<Response> {
  return compressedBody(
    request,
    body,
    "text/plain; charset=utf-8",
    init,
  );
}

async function compressedBody(
  request: Request,
  body: string,
  contentType: string,
  init?: ResponseInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", contentType);

  const accepts = request.headers.get("accept-encoding") ?? "";
  const wantsGzip = /\bgzip\b/.test(accepts);

  if (wantsGzip && body.length >= MIN_SIZE_TO_COMPRESS) {
    const compressed = await gzipAsync(body);
    headers.set("content-encoding", "gzip");
    // Without this, a CDN/edge cache might serve the gzipped body to a
    // client that didn't send Accept-Encoding: gzip.
    appendVary(headers, "accept-encoding");
    return new Response(new Uint8Array(compressed), { ...init, headers });
  }

  return new Response(body, { ...init, headers });
}

function appendVary(headers: Headers, value: string) {
  const existing = headers.get("vary");
  if (!existing) {
    headers.set("vary", value);
    return;
  }
  if (existing.toLowerCase().split(",").map((s) => s.trim()).includes(value)) {
    return;
  }
  headers.set("vary", `${existing}, ${value}`);
}
