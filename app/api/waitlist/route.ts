// Records experimental-features waitlist interest for the current user.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { setExperimentalWaitlist } from "@/lib/auth/service";

// Experimental-features wait list (About page). Joining records a timestamp
// on the user row; granting actual access stays a manual DB flag (see
// migration 021). Both verbs are idempotent.

export async function POST() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  await setExperimentalWaitlist(auth.user.id, true);
  return NextResponse.json({ onWaitlist: true });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  await setExperimentalWaitlist(auth.user.id, false);
  return NextResponse.json({ onWaitlist: false });
}
