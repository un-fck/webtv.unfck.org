import { headers } from "next/headers";

/**
 * Get the base URL for the application.
 * Works across all environments: localhost, Vercel preview, Vercel production, custom domains.
 *
 * Priority:
 * 1. BASE_URL env var (canonical override — required for cron-sent emails, since
 *    Vercel cron invokes deployment-specific *.vercel.app hostnames and the
 *    request `host` header would otherwise leak that into email links)
 * 2. Request host header (dynamic — supports multiple domains pointing to same deployment)
 * 3. VERCEL_PROJECT_PRODUCTION_URL (Vercel production domain)
 * 4. VERCEL_URL (Vercel preview/branch deployments)
 * 5. localhost:3000 (local development fallback)
 *
 * @see https://vercel.com/docs/projects/environment-variables/system-environment-variables
 */
export async function getBaseUrl(): Promise<string> {
  if (process.env.BASE_URL) {
    return normalizeUrl(process.env.BASE_URL);
  }

  try {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = headersList.get("x-forwarded-proto") || "https";

    if (host) {
      const scheme = host.startsWith("localhost") ? "http" : protocol;
      return `${scheme}://${host}`;
    }
  } catch {
    // headers() not available (e.g., during build time) - fall through to env vars
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
