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

/**
 * Trusted origin resolved from configuration only — it NEVER reads the request
 * `Host` header. Use this for any URL we EMAIL to a user (magic-link sign-in,
 * transcript notifications): a forged `Host` on the triggering request would
 * otherwise become an attacker-controlled link in a genuine, trusted email
 * (magic-link token theft → account takeover). It also avoids leaking the
 * cron's `127.0.0.1` host into notification links.
 *
 * Priority: BASE_URL → VERCEL_PROJECT_PRODUCTION_URL → (dev only) localhost.
 * Deliberately omits VERCEL_URL (deployment-specific preview host) and the
 * request Host. Fails closed in production if no canonical origin is
 * configured — better a 500 on send than a poisonable link.
 */
export function getTrustedBaseUrl(): string {
  if (process.env.BASE_URL) {
    return normalizeUrl(process.env.BASE_URL);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.NODE_ENV !== "production") {
    return `http://localhost:${process.env.PORT || "3000"}`;
  }
  throw new Error(
    "BASE_URL must be set in production (required for links in outbound email)",
  );
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
