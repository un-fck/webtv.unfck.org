import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all paths except: api routes, json endpoints (locale-free public
  // data), Next.js internals, Vercel internals, Sentry tunnel, anything with
  // a file extension (favicon, images, /robots.txt, /sitemap.xml).
  matcher: "/((?!api|json|_next|_vercel|monitoring|.*\\..*).*)",
};
