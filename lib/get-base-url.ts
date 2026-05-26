import { headers } from "next/headers";

/**
 * Get the base URL for the application.
 * Works across all environments: localhost, Vercel preview, Vercel production, custom domains.
 *
 * Priority:
 * 1. Request host header (dynamic - supports multiple domains pointing to same deployment)
 * 2. BASE_URL env var (explicit override fallback)
 * 3. VERCEL_PROJECT_PRODUCTION_URL (Vercel production domain)
 * 4. VERCEL_URL (Vercel preview/branch deployments)
 * 5. localhost:3000 (local development fallback)
 *
 * @see https://vercel.com/docs/projects/environment-variables/system-environment-variables
 */
export async function getBaseUrl(): Promise<string> {
  // 1. Try to get host from request headers (works in server components, API routes, server actions)
  try {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = headersList.get("x-forwarded-proto") || "https";

    if (host) {
      // Use http for localhost, https for everything else
      const scheme = host.startsWith("localhost") ? "http" : protocol;
      return `${scheme}://${host}`;
    }
  } catch {
    // headers() not available (e.g., during build time) - fall through to env vars
  }

  // 2. Explicit BASE_URL takes priority when headers unavailable
  if (process.env.BASE_URL) {
    return normalizeUrl(process.env.BASE_URL);
  }

  // 3. Vercel production URL (automatically set by Vercel)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // 4. Vercel deployment URL (preview branches, PR deployments)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 5. Local development fallback
  const port = process.env.PORT || "3000";
  return `http://localhost:${port}`;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
