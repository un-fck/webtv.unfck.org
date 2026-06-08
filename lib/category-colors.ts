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

// Categories not listed here render with the neutral "gray" color.
const CATEGORY_COLOR: Record<string, CategoryColor> = {
  // Principal organs — one accent each
  "General Assembly": "blue",
  "Security Council": "red",
  "Economic and Social Council": "green",
  "Human Rights Council": "purple",
  "Human Rights Treaty Bodies": "purple",
  "International Court of Justice": "gray",
  "Trusteeship Council": "gray",

  // Press / media family
  "Press Conferences": "orange",
  "Media Stakeouts": "orange",
  Media: "orange",

  // Conferences & event scaffolding — yellow ties them together loosely
  Conferences: "yellow",
  "High-level Events": "yellow",
  "Side Events": "yellow",

  // Operational/agency family — green, shared with ECOSOC's development frame
  "Agencies, Funds & Programmes": "green",
  "Goals Lounge": "green",
  "SDG Studio": "green",

  // Catch-all bucket
  "Meetings & Events": "gray",
  Concerts: "gray",
  Features: "gray",
};

export function getCategoryColor(category: string | null | undefined): CategoryColor {
  if (!category) return "gray";
  return CATEGORY_COLOR[category] ?? "gray";
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
