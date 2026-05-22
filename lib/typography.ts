// Semantic typography scale — the single source of truth for text size/weight.
// Compose with cn() from "@/lib/utils", e.g. cn(typography.sectionTitle, "mb-3").
// Structural tiers omit color where it varies by context; include it where consistent.
//
// New text should use a token here rather than raw text-*/font-* utilities.
// Intentionally bespoke and NOT covered: the brand logo / "Public Preview" badge in
// site-header.tsx, and the shadcn button's own cva sizing in components/ui/button.tsx.
export const typography = {
  // Standalone page hero titles (about, methodology)
  pageTitle: "text-3xl font-bold tracking-tight text-foreground",
  // Standalone card titles (error pages, login)
  cardTitle: "text-2xl font-semibold text-foreground",
  // Primary content title + peer section headings (video title, "Transcript",
  // about/methodology <h2>s) — unifies the video-title vs "Transcript" mismatch
  sectionTitle: "text-xl font-semibold tracking-tight text-foreground",
  // Sub-section / step titles (methodology steps)
  subTitle: "text-base font-semibold text-foreground",
  // Intro / lead paragraph under a title
  lead: "text-lg text-muted-foreground",
  // Speaker name labels in transcript/PV/analysis views
  speakerLabel: "text-sm font-semibold tracking-wide text-foreground",
  // Default body / transcript paragraph text
  body: "text-sm leading-relaxed",
  // Long-form prose pages (about/methodology body wrappers)
  prose: "text-base leading-relaxed text-foreground",
  // Metadata rows (date/time/body/category/duration, etc.)
  meta: "text-sm text-muted-foreground",
  // Small captions, timestamps, back-links
  caption: "text-xs text-muted-foreground",
  // Inline form/control labels, button text, badge text
  label: "text-xs font-medium",
  // Table column headers
  tableHeader:
    "text-xs font-medium tracking-wider text-muted-foreground uppercase",
} as const;
