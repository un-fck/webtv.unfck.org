// Shared trigger style for the header's preference controls (language,
// timezone). Keeps the language and timezone pills visually identical so the
// row reads as a single zone of "preferences". Height matches the avatar
// chip and small icon buttons elsewhere in the header (h-8).
//
// Asymmetric horizontal padding: `pl-2 pr-1.5` pulls the chevron 2 px closer
// to the pill's right edge, compensating for the chevron's `opacity-60` —
// without that nudge the perceived pill-to-pill gap reads ~32 px (vs 16 px
// for the bare text nav items), because the chevron fades out before the
// pill actually ends.
//
// Borderless on purpose — the outline Sign-in button needs to remain the only
// outlined element in the header so identity stays visually distinct from
// preferences.
export const headerPillClass =
  "inline-flex h-8 items-center gap-1.5 rounded-md pl-2 pr-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
