import { getCurrentUser, type AuthUser } from "./service";
import { apiError } from "@/lib/api-error";
import { NextResponse } from "next/server";

/**
 * Guard for route handlers gating private features (e.g. analysis).
 * Returns `{ user }` when authenticated, or `{ response }` with a 401 to
 * return directly from the handler.
 */
export async function requireUser(): Promise<
  { user: AuthUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: apiError(401, "unauthorized", "Sign in to access this feature"),
    };
  }
  return { user };
}
