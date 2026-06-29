import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
