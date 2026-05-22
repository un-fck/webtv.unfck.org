// Remembers the last filtered schedule URL so the meeting page's "Back to
// schedule" link can return the user to the homepage *with their filters*,
// without ever landing them somewhere else (unlike history.back()).

const KEY = "scheduleReturnUrl";

/** Store the current schedule path+query (called from the homepage). */
export function rememberScheduleUrl(url: string) {
  try {
    sessionStorage.setItem(KEY, url);
  } catch {
    // sessionStorage may be unavailable (private mode, SSR); ignore.
  }
}

/** The remembered schedule URL, or "/" if none — always a homepage URL. */
export function getScheduleReturnUrl(): string {
  try {
    return sessionStorage.getItem(KEY) || "/";
  } catch {
    return "/";
  }
}
