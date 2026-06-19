import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// "/{locale}/{...slug}.{json|txt}" — the public data-API URL grammar. Append
// `.json` or `.txt` to any meeting page URL to get the same content in that
// format. See app/api/data/[locale]/[...path]/route.ts for the actual handler.
const DATA_PATH = /^\/(ar|zh|en|fr|ru|es)\/(.+)\.(json|txt)$/;

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

  return intl(req);
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
