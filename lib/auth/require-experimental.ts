import { NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "./service";
import { apiError } from "@/lib/api-error";

/**
 * Guard for routes gated behind the single experimental-access flag.
 * Returns `{ user }` when allowed; otherwise `{ response }` with a ready
 * 401 (not signed in) or 403 (signed in but flag is false). Mirrors the
 * shape of `requireUser` so call sites read uniformly.
 */
export async function requireExperimental(): Promise<
  | { user: AuthUser; response?: never }
  | { user?: never; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: apiError(401, "unauthorized", "Sign in to access this feature"),
    };
  }
  if (!user.experimentalAccess) {
    return {
      response: apiError(
        403,
        "experimental_access_required",
        "This is an experimental feature. See the About page to request access.",
      ),
    };
  }
  return { user };
}
