import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escape every regex metacharacter in `text` so it matches literally when
 * interpolated into a `new RegExp(...)` source.
 *
 * Hand-rolled escaping tends to cover only the characters the author happened
 * to think of, which fails two ways: an unescaped `(` throws a SyntaxError at
 * construction, and an unescaped `.` or `*` silently matches the wrong thing.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Serialize a value for safe embedding inside an inline `<script>` element
 * (e.g. a JSON-LD structured-data island). `JSON.stringify` does NOT escape
 * `<`, `>`, `&`, or U+2028/U+2029, so a string value containing `</script>`
 * would break out of the script element — a stored-XSS vector when any field
 * derives from untrusted data (scraped titles, AI summaries). This escapes
 * those characters to their `\uXXXX` forms, which JSON parsers decode back to
 * the originals, so consumers see identical data while the markup stays inert.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Decode catch-all route segments, returning `null` when any segment carries
 * malformed percent-encoding. `decodeURIComponent` THROWS a `URIError` on
 * invalid escapes (e.g. `%25u002e%25u002e` or a lone `%`), which scanners and
 * attack URLs routinely supply. Callers use the `null` return to fall through
 * to a clean 404 instead of surfacing an uncaught 500 from
 * `generateMetadata`/the page component/the route handler.
 */
export function safeDecodePathSegmentsArray(
  segments: string[],
): string[] | null {
  const decoded: string[] = [];
  for (const segment of segments) {
    try {
      decoded.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }
  return decoded;
}

/**
 * Like {@link safeDecodePathSegmentsArray} but joins the decoded segments into
 * a single `/`-delimited path — the common case for slug/asset-id resolution.
 * Returns `null` on any malformed segment.
 */
export function safeDecodePathSegments(segments: string[]): string | null {
  const decoded = safeDecodePathSegmentsArray(segments);
  return decoded === null ? null : decoded.join("/");
}
