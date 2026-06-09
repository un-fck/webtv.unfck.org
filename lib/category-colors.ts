// Maps a WebTV category (raw English string, as stored in `videos.category`) to
// a color from the UN brand accent palette. The brand guide reserves accent
// colors for differentiating items in charts/graphs/maps; we treat the schedule
// table category column as that case. Colors appear only as a small dot on the
// pill — never as a full background — to stay within the guide's intent.

export type CategoryColor =
  | "blue"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "gray";

// Only the five primary categories shown as inline filter pills get a brand
// color. Every other category — overflow filter pills, schedule rows, meeting
// page — renders without a dot so the colored signal stays meaningful rather
// than degenerating into "every row has a colored dot."
//
// Colors follow the canonical UN System organisational chart:
//   green = General Assembly + its subsidiary organs
//   orange = Security Council
//   blue = ECOSOC
//   yellow = Secretariat (incl. DGC press operations)
// One adjustment: HRC → purple (canonically GA-green, but reusing chart-purple
// breaks the GA cluster and visually ties HRC to its rights/court semantics).
const CATEGORY_COLOR: Record<string, CategoryColor> = {
  "Press Conferences": "yellow",
  "General Assembly": "green",
  "Security Council": "orange",
  "Economic and Social Council": "blue",
  "Human Rights Council": "purple",
};

export function getCategoryColor(
  category: string | null | undefined,
): CategoryColor | null {
  if (!category) return null;
  return CATEGORY_COLOR[category] ?? null;
}

// Tailwind class names per color. Two surfaces:
//   - `dot`   — solid 6px circle used inside pills (filter + row).
//   - `text`  — WCAG-AA accessible variant when the category name itself is
//               rendered in the accent color (e.g. selected filter pill).
// Both pull from the tokens declared in globals.css so the brand palette stays
// the single source of truth.
export const CATEGORY_DOT_CLASS: Record<CategoryColor, string> = {
  blue: "bg-un-blue",
  green: "bg-un-green",
  yellow: "bg-un-yellow",
  orange: "bg-un-orange",
  red: "bg-un-red",
  purple: "bg-un-purple",
  gray: "bg-un-gray",
};

export const CATEGORY_TEXT_CLASS: Record<CategoryColor, string> = {
  blue: "text-un-blue-text",
  green: "text-un-green-text",
  yellow: "text-un-yellow-text",
  orange: "text-un-orange-text",
  red: "text-un-red-text",
  purple: "text-un-purple-text",
  gray: "text-un-gray-text",
};
