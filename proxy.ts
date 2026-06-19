import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// "/{locale}/{...slug}.{json|txt}" — the public data-API URL grammar. Append
// `.json` or `.txt` to any meeting page URL to get the same content in that
// format. See app/api/data/[locale]/[...path]/route.ts for the actual handler.
const DATA_PATH = /^\/(ar|zh|en|fr|ru|es)\/(.+)\.(json|txt)$/;

// Locale-prefixed paths whose first sub-segment names a meeting (citation
// prefixes from lib/meeting-slug.ts plus the `asset/...` permalink form).
// Used to decide whether to emit per-meeting `.txt`/`.json` Link headers.
const MEETING_PATH =
  /^\/(?:ar|zh|en|fr|ru|es)\/(sc|ga|hrc|ecosoc|cat|cerd|ccpr|cedaw|crc|crpd|cescr|cmw|ced|spt|briefing|asset)\//;

export default function middleware(req: NextRequest) {
  const m = req.nextUrl.pathname.match(DATA_PATH);
  if (m) {
    const [, locale, path, ext] = m;
    // Format is encoded as the FIRST segment after the locale (text | json),
    // not as a query param. `NextResponse.rewrite` doesn't reliably propagate
    // added query params to the destination handler's `request.nextUrl`, but
    // path segments survive intact via the route's params.
    const fmt = ext === "txt" ? "text" : "json";
    const url = req.nextUrl.clone();
    url.pathname = `/api/data/${locale}/${fmt}/${path}`;
    return NextResponse.rewrite(url);
  }

  const res = intl(req);

  // Discovery hints for LLM crawlers. The llms.txt spec doesn't standardize
  // a discovery mechanism; the de-facto convention (Mintlify-hosted docs
  // like docs.anthropic.com, docs.cursor.com) is HTTP `Link` headers with
  // `rel="llms-txt"` / `rel="llms-full-txt"`. Always emitted here; per-
  // meeting `.txt` / `.json` alternates are appended only on meeting URLs.
  //
  // We set this in proxy.ts (not next.config.ts `headers()`) because next-
  // intl's middleware response replaces the default Next response, so
  // routing-layer `headers()` does not propagate to locale-routed pages.
  res.headers.append(
    "Link",
    '</llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt"',
  );
  const pathname = req.nextUrl.pathname;
  if (MEETING_PATH.test(pathname)) {
    res.headers.append(
      "Link",
      `<${pathname}.txt>; rel="alternate"; type="text/plain", <${pathname}.json>; rel="alternate"; type="application/json"`,
    );
  }

  return res;
}

export const config = {
  // Two distinct matchers:
  //   1. The next-intl matcher: HTML pages without file extensions and
  //      excluding internal namespaces (api routes, _next, Sentry tunnel).
  //   2. A second matcher for `.json` / `.txt` URLs under a locale prefix,
  //      so this middleware can rewrite them to the data handler.
  matcher: [
    "/((?!api|_next|_vercel|monitoring|.*\\..*).*)",
    "/(ar|zh|en|fr|ru|es)/(.*\\.(?:json|txt))",
  ],
};
