"use client";

import type { ServerParams } from "@/app/[locale]/page";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Video } from "@/lib/un-api";
import { CalendarIcon, ChevronDown, Search, SearchX, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMeetingFormat } from "@/lib/hooks/use-meeting-format";
import { rememberScheduleUrl } from "@/lib/schedule-return";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

// Semantic grouping for the category filter rows. Each inner array is one row,
// in display order. This also drives the day/category header ordering within
// the schedule (CATEGORY_ORDER is the flattened form). Anything not listed
// sorts after these (alphabetically); uncategorized ("") sorts last.
const CATEGORY_GROUPS: { items: string[] }[] = [
  {
    items: [
      "Press Conferences",
      "Media Stakeouts",
      "Media",
      "Concerts",
      "Goals Lounge",
      "SDG Studio",
      "Features",
    ],
  },
  {
    items: [
      "General Assembly",
      "Security Council",
      "Economic and Social Council",
      "Human Rights Council",
      "Human Rights Treaty Bodies",
      "Trusteeship Council",
      "International Court of Justice",
    ],
  },
  {
    items: [
      "Agencies, Funds & Programmes",
      "High-level Events",
      "Meetings & Events",
      "Conferences",
      "Side Events",
    ],
  },
];
const CATEGORY_ORDER: string[] = CATEGORY_GROUPS.flatMap((g) => g.items);
const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));

// Curated categories kept out of the inline filter row even when they meet
// the count threshold — too generic to be useful as primary filters, but
// still selectable via the "More" dropdown.
const INLINE_FILTER_EXCLUDE = new Set<string>([
  "Meetings & Events",
  "Conferences",
  "Side Events",
]);

// Sort categories by the hardcoded order; unknown categories go after the known
// ones (alphabetically), and the empty/uncategorized bucket goes dead last.
function compareCategories(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const ra = CATEGORY_RANK.get(a) ?? Number.POSITIVE_INFINITY;
  const rb = CATEGORY_RANK.get(b) ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

// Format an "HH:MM:SS" duration: decimal hours over an hour ("3.5h", "2h"),
// minutes under an hour ("44min").
function formatDuration(duration: string): string | null {
  if (!duration || duration === "00:00:00") return null;
  const parts = duration.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  let h = 0;
  let m = 0;
  if (parts.length === 3) [h, m] = parts;
  else if (parts.length === 2) [m] = parts;
  const totalMin = h * 60 + m;
  if (totalMin === 0) return "<1min";
  if (totalMin < 60) return `${m}min`;
  const hours = Math.round((totalMin / 60) * 10) / 10;
  return `${hours}h`;
}

// --- Filter popovers ---

// Shared trigger styling for the filter-toolbar dropdown buttons.
const TOOLBAR_TRIGGER =
  "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors";
const toolbarTriggerClass = (active: boolean) =>
  cn(
    TOOLBAR_TRIGGER,
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-slate-300 bg-white text-muted-foreground hover:text-foreground",
  );

function useT() {
  return useTranslations("schedule");
}

// Categories come from WebTV as raw strings (English, because our scraper
// hits /en/schedule/). Display them in the active locale via a hand-built
// lookup table seeded from per-locale WebTV scrapes; fall back to the raw
// string when no translation exists (e.g. WebTV-only branded events like
// "Goals Lounge", "SDG Studio", or future categories we haven't catalogued
// yet). `t.has(key)` avoids next-intl throwing for missing keys.
function useCategoryName(): (category: string) => string {
  const t = useTranslations("schedule.categoryNames");
  return (category: string): string =>
    category && t.has(category) ? t(category) : category;
}

function DateFilterPopover({
  availableDates,
  selectedDate,
  onChange,
}: {
  availableDates: string[];
  selectedDate: string | undefined;
  onChange: (date: string | undefined) => void;
}) {
  const { formatMeetingDate } = useMeetingFormat();
  const t = useT();
  const isActive = !!selectedDate;

  // Build set of date strings that have videos
  const availableDaySet = useMemo(
    () => new Set(availableDates),
    [availableDates],
  );

  // Only enable days that have videos
  const disabledMatcher = (date: Date) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return !availableDaySet.has(iso);
  };

  // Default month to show: selected date, or most recent available date
  const defaultMonth = selectedDate
    ? new Date(selectedDate + "T00:00:00")
    : availableDates[0]
      ? new Date(availableDates[0] + "T00:00:00")
      : undefined;

  const selectedDateObj = selectedDate
    ? new Date(selectedDate + "T00:00:00")
    : undefined;

  return (
    <Popover>
      <PopoverTrigger className={toolbarTriggerClass(isActive)}>
        <CalendarIcon className="h-4 w-4" />
        <span>
          {selectedDate ? formatMeetingDate(selectedDate) : t("date")}
        </span>
        {selectedDate ? (
          <X
            className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(undefined);
            }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {selectedDate && (
          <button
            onClick={() => onChange(undefined)}
            className="flex w-full items-center gap-1 border-b px-3 py-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <X className="h-3 w-3" /> Clear date filter
          </button>
        )}
        <Calendar
          mode="single"
          selected={selectedDateObj}
          onSelect={(day) => {
            if (day) {
              const yyyy = day.getFullYear();
              const mm = String(day.getMonth() + 1).padStart(2, "0");
              const dd = String(day.getDate()).padStart(2, "0");
              onChange(`${yyyy}-${mm}-${dd}`);
            } else {
              onChange(undefined);
            }
          }}
          defaultMonth={defaultMonth}
          disabled={disabledMatcher}
        />
      </PopoverContent>
    </Popover>
  );
}

// Category filter rendered inline as a single wrapping bar of toggle pills.
// The inline row shows the curated CATEGORY_GROUPS items present at ≥100
// meetings. Everything else (rare curated categories + any uncategorized
// WebTV strings we haven't mapped) lives behind a "More" pill that opens a
// popover with the same toggle UI, so no category becomes unreachable.
function CategoryFilterRows({
  options,
  selected,
  onChange,
  counts,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  counts?: Record<string, number>;
}) {
  const t = useTranslations("schedule");
  const tCategory = useCategoryName();
  // Optimistic mirror of `selected` so clicks update the pill UI immediately,
  // before the URL-driven RSC round-trip lands a fresh `selected` prop. Without
  // this, rapid clicks (especially deselecting one of several active pills)
  // appear unresponsive — the handler closes over the stale prop and the visual
  // state only catches up when the server responds. Synced from the prop via a
  // value-based key so identity-only changes (`?? []`) don't clobber pending
  // edits.
  const [optimisticSelected, setOptimisticSelected] = useState(selected);
  const selectedKey = [...selected].sort().join(" ");
  useEffect(() => {
    setOptimisticSelected(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);
  const toggle = (value: string) => {
    const next = optimisticSelected.includes(value)
      ? optimisticSelected.filter((v) => v !== value)
      : [...optimisticSelected, value];
    setOptimisticSelected(next);
    onChange(next);
  };

  const optionSet = new Set(options);
  // Inline: curated categories with ≥100 meetings, in CATEGORY_GROUPS order,
  // minus any explicitly held back for the "More" dropdown.
  const inlineItems = CATEGORY_GROUPS.flatMap((g) => g.items).filter(
    (c) =>
      optionSet.has(c) &&
      (counts?.[c] ?? 0) >= 100 &&
      !INLINE_FILTER_EXCLUDE.has(c),
  );
  const inlineSet = new Set(inlineItems);
  // Overflow: everything else, sorted by count desc.
  const overflowItems = options
    .filter((c) => !inlineSet.has(c))
    .sort((a, b) => (counts?.[b] ?? 0) - (counts?.[a] ?? 0));

  if (inlineItems.length === 0 && overflowItems.length === 0) return null;

  const pill = (opt: string) => (
    <button
      key={opt}
      onClick={() => toggle(opt)}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
        optimisticSelected.includes(opt)
          ? "bg-primary text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {tCategory(opt)}
      {counts?.[opt] !== undefined && (
        <span
          className={cn(
            "ml-1",
            optimisticSelected.includes(opt) ? "opacity-75" : "opacity-50",
          )}
        >
          {counts[opt]}
        </span>
      )}
    </button>
  );

  const overflowSelectedCount = overflowItems.filter((c) =>
    optimisticSelected.includes(c),
  ).length;
  const overflowActive = overflowSelectedCount > 0;

  return (
    <div className="flex flex-wrap gap-1.5">
      {inlineItems.map(pill)}
      {overflowItems.length > 0 && (
        <Popover>
          <PopoverTrigger
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              overflowActive
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t("moreCategories")}
            {overflowActive && (
              <span className="ml-1 opacity-75">{overflowSelectedCount}</span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-80 overflow-auto p-3">
            <div className="flex flex-wrap gap-1.5">
              {overflowItems.map(pill)}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// Search box, shared by the desktop and mobile filter bars. The wrapper width
// is the only thing that differs between breakpoints (className).
function SearchInput({
  value,
  onChange,
  onSubmit,
  isFocused,
  setIsFocused,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isFocused: boolean;
  setIsFocused: (focused: boolean) => void;
  className?: string;
}) {
  const t = useT();
  const placeholder = t("searchPlaceholder");
  const highlighted = isFocused || value.trim().length > 0;
  return (
    <div className={`group relative ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search
          className={`h-4 w-4 transition-colors ${highlighted ? "text-primary" : "text-slate-400 group-hover:text-primary"}`}
          aria-hidden="true"
        />
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit(value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          onSubmit(value);
        }}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="none"
        aria-label={placeholder}
        className={`block h-10 w-full touch-manipulation rounded-lg border px-3 pl-9 text-sm transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          highlighted
            ? "border-primary/40 bg-primary/10 text-primary placeholder-primary/50"
            : "border-slate-300 bg-white text-slate-400 placeholder-slate-400 hover:border-primary/40 hover:text-primary hover:placeholder-primary/70"
        }`}
      />
      {value && (
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            onSubmit("");
          }}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-primary/50 hover:text-primary"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Compact letter chips for the desktop Transcripts column: T (AI transcript),
// V (verbatim record), S (summary record). The full
// name is in a hover tooltip. Letters distinguish the three types far more
// legibly than icons would at this size.
//
// The T badge is two-tier: solid when a completed transcript exists in the
// active UI locale, muted (border-only) when one exists only in some other
// language. V and S stay single-tier — per-language PV availability would
// require deeper changes to the check-pv cron (see plan, follow-up).
function DocChips({
  hasTranscript,
  hasTranscriptInLocale,
  pvAvailable,
  pvSymbol,
}: {
  hasTranscript: boolean;
  hasTranscriptInLocale: boolean;
  pvAvailable: boolean;
  pvSymbol: string | null;
}) {
  const tTooltip = useTranslations("schedule.docTooltips");
  if (!hasTranscript && !pvAvailable) return null;
  const isSR = pvSymbol?.includes("/SR.");
  const chips: { letter: string; label: string; className: string }[] = [];
  if (hasTranscript) {
    chips.push({
      letter: "T",
      label: hasTranscriptInLocale
        ? tTooltip("transcript")
        : tTooltip("transcriptOtherLang"),
      className: hasTranscriptInLocale
        ? "bg-primary/10 text-primary"
        : "border border-primary/40 text-primary/60",
    });
  }
  if (pvAvailable) {
    chips.push(
      isSR
        ? {
            letter: "S",
            label: tTooltip("sr"),
            className: "bg-violet-500/10 text-violet-700",
          }
        : {
            letter: "V",
            label: tTooltip("pv"),
            className: "bg-amber-500/10 text-amber-700",
          },
    );
  }
  return (
    <span className="mr-1.5 inline-flex gap-1 align-middle">
      {chips.map((chip) => (
        <Tooltip key={chip.letter}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold",
                chip.className,
              )}
            >
              {chip.letter}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56 text-xs">
            {chip.label}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

// Binary/segmented toggle (e.g. Recent/Scheduled, All/Transcribed). Shared by
// the desktop and mobile filter bars so both stay visually identical.
//
// `disabled` greys the toggle out and blocks interaction — used when another
// filter (e.g. a specific date) makes this control redundant. We keep it
// rendered rather than hidden so the user can still see what its value is and
// recover by clearing the dominating filter.
function SegmentedToggle({
  options,
  disabled = false,
}: {
  options: { label: string; active: boolean; onSelect: () => void }[];
  disabled?: boolean;
}) {
  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "flex h-10 rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-medium",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {options.map(({ label, active, onSelect }) => (
        <button
          key={label}
          onClick={() => !active && onSelect()}
          disabled={disabled}
          className={`rounded-md px-4 py-1.5 transition-all ${
            active
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Any of these document types counts as "having a transcript" for the
// coarse All / With transcript toggle.
const ALL_DOC_TYPES = ["transcript", "pv", "sr"];


interface VideoTableProps {
  videos: Video[];
  totalCount: number;
  // Count under the same filters with the per-locale visibility cut dropped.
  // When strict mode is on and the active locale is non-English, the delta
  // (`totalCountIncludingOther - totalCount`) drives the "(N more in other
  // languages)" CTA next to the toggle.
  totalCountIncludingOther: number;
  serverParams: ServerParams;
  availableDates: string[];
  filterOptions: {
    bodies: string[];
    categories: string[];
    bodyCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
  };
}

export function VideoTable({
  videos,
  totalCount,
  totalCountIncludingOther,
  serverParams,
  availableDates,
  filterOptions,
}: VideoTableProps) {
  const router = useRouter();
  const t = useT();
  const tCategory = useCategoryName();
  const searchParams = useSearchParams();
  // Active UI locale; appended to /api/videos so server-side
  // record→video conversion returns localized titles/categories.
  const locale = useLocale();
  const { formatMeetingDate, formatMeetingTime, isFutureDay } =
    useMeetingFormat();

  // Search input state — what the user has typed. Synced both ways with the
  // `q` URL param (debounced typing → URL; back/forward → input).
  const [inputValue, setInputValue] = useState(serverParams.q || "");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Result feed (browse + search are the same feed now). Seeded with the
  // server-rendered first chunk; further chunks append via /api/videos.
  // Re-seeded whenever a fresh SSR payload arrives (filter/q/sort change →
  // new `videos` prop).
  const [rows, setRows] = useState<Video[]>(videos);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(videos.length < totalCount);
  useEffect(() => {
    setRows(videos);
    setHasMore(videos.length < totalCount);
  }, [videos, totalCount]);

  // URL-driven param updater
  const updateParams = useCallback(
    (
      updates: Partial<ServerParams> & {
        resetPage?: boolean;
        replace?: boolean;
      },
    ) => {
      const { resetPage = true, replace = false, ...paramUpdates } = updates;
      const next = { ...serverParams, ...paramUpdates };
      if (resetPage && !("page" in paramUpdates)) {
        next.page = 1;
      }

      const sp = new URLSearchParams();
      if (next.page > 1) sp.set("page", String(next.page));
      if (next.pageSize !== 50) sp.set("pageSize", String(next.pageSize));
      if (next.sort) sp.set("sort", next.sort);
      if (next.date) sp.set("date", next.date);
      next.body?.forEach((v) => sp.append("body", v));
      next.category?.forEach((v) => sp.append("category", v));
      next.text?.forEach((v) => sp.append("text", v));
      if (next.q) sp.set("q", next.q);
      if (next.includeOtherLangs) sp.set("xlang", "1");
      if (next.view === "upcoming") sp.set("view", "upcoming");

      const href = sp.toString() ? `?${sp}` : "/";
      // Search updates use replace() so typing doesn't flood browser history.
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [serverParams, router],
  );

  // Tracks the q value we last wrote to the URL ourselves, so the sync effect
  // below can tell our own live-search writes apart from external navigation.
  const lastWrittenQuery = useRef(serverParams.q ?? "");

  // Sync search input from genuine URL changes (back/forward) only — our own
  // live-search writes are ignored so they can't clobber in-progress typing.
  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    if (urlQuery !== lastWrittenQuery.current) {
      lastWrittenQuery.current = urlQuery;
      setInputValue(urlQuery);
    }
  }, [searchParams]);

  // Live search: debounce typed input → q param (replace, no history spam).
  useEffect(() => {
    const trimmed = inputValue.trim();
    if (trimmed === lastWrittenQuery.current) return; // already in sync
    if (trimmed.length === 1) return; // too short to query, but don't clear yet
    const id = setTimeout(() => {
      lastWrittenQuery.current = trimmed;
      updateParams({ q: trimmed || undefined, replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [inputValue, updateParams]);

  // Remember the filtered schedule URL so the meeting page's "Back to
  // schedule" link can return here with filters intact.
  useEffect(() => {
    rememberScheduleUrl(`${window.location.pathname}${window.location.search}`);
  }, [searchParams]);

  // Immediate flush (Enter / blur / clear) — bypasses the debounce. Uses
  // replace() like the live-search path so typing doesn't flood history.
  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    setInputValue(trimmed);
    if (trimmed === lastWrittenQuery.current) return;
    lastWrittenQuery.current = trimmed;
    updateParams({ q: trimmed || undefined, replace: true });
  };

  // Display hint only: drives the flat-vs-grouped layout and the
  // relevance/date sort toggle. Doesn't gate the fetch path anymore — both
  // browse and search go through /api/videos.
  const isSearchMode = !!serverParams.q;

  // Append the next chunk from /api/videos using the current filters and
  // (if set) text query. The endpoint is the single feed entry point now;
  // queryVideos in lib/db.ts decides whether to apply FTS or just structural
  // predicates based on whether `q` is present.
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const sp = new URLSearchParams();
    sp.set("offset", String(rows.length));
    sp.set("locale", locale);
    if (serverParams.q) sp.set("q", serverParams.q);
    if (serverParams.includeOtherLangs) sp.set("xlang", "1");
    if (serverParams.sort) sp.set("sort", serverParams.sort);
    if (serverParams.date) sp.set("date", serverParams.date);
    serverParams.body?.forEach((v) => sp.append("body", v));
    serverParams.category?.forEach((v) => sp.append("category", v));
    serverParams.text?.forEach((v) => sp.append("text", v));
    fetch(`/api/videos?${sp}`)
      .then((res) => res.json())
      .then((data) => {
        setRows((prev) => [...prev, ...data.videos]);
        let nextHasMore = Boolean(data.hasMore);
        // Upcoming view only renders future rows, but the server pages
        // descend through the whole date window. Once a chunk has no future
        // rows we know the rest of the feed is all past — keep going and the
        // bottom sentinel would refire on each invisible chunk in a loop.
        if (
          nextHasMore &&
          serverParams.view === "upcoming" &&
          !(data.videos as Video[]).some((v) =>
            isFutureDay(v.scheduledTime ?? v.date),
          )
        ) {
          nextHasMore = false;
        }
        setHasMore(nextHasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [
    loadingMore,
    hasMore,
    rows.length,
    serverParams,
    locale,
    isFutureDay,
  ]);

  // Auto-load the next chunk when the bottom sentinel nears the viewport. The
  // callback is held in a ref so the observer doesn't reattach every render;
  // re-running on rows.length re-fires if the sentinel is still in view after
  // a short append (so the feed keeps filling until the viewport scrolls).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, rows.length]);

  // Coarse "With transcript" filter: active when every doc type is selected
  // (any of transcript / PV / SR counts as a transcript). Drives the All vs
  // Transcribed segmented toggle.
  const withTranscript = ALL_DOC_TYPES.every((d) =>
    (serverParams.text ?? []).includes(d),
  );

  // The per-locale visibility cut only narrows non-English schedules — every
  // video has English canonical metadata so `/en/` already sees everything.
  // For English the toggle would just confuse, so we hide it entirely.
  const localeFilterApplicable = locale !== "en";
  const includeOtherLangs = serverParams.includeOtherLangs === true;
  const toggleIncludeOtherLangs = () =>
    updateParams({
      includeOtherLangs: includeOtherLangs ? undefined : true,
    });
  // How many more meetings would appear if the user flipped the toggle. The
  // server returns `total{,IncludingOther}` from the same WHERE chain with
  // the locale cut dropped — see queryVideos in lib/db.ts. SSR delivers fresh
  // counts on every filter/query change, so the same prop drives both modes.
  const otherLangsCount = Math.max(
    0,
    totalCountIncludingOther - totalCount,
  );

  // Search-result ordering: relevance (default, no sort param) vs newest-first.
  const searchSortOptions = [
    {
      label: t("relevance"),
      active: !serverParams.sort,
      onSelect: () => updateParams({ sort: undefined }),
    },
    {
      label: t("date"),
      active: !!serverParams.sort?.startsWith("date"),
      onSelect: () => updateParams({ sort: "date_desc" }),
    },
  ];

  const hasActiveFilters =
    !!serverParams.date ||
    (serverParams.body?.length ?? 0) > 0 ||
    (serverParams.category?.length ?? 0) > 0 ||
    (serverParams.text?.length ?? 0) > 0;
  const showEmptyState = rows.length === 0;
  // Day/category grouping only makes sense when rows are in date order;
  // relevance-sorted search results would fragment into 1-row groups.
  const groupByDate = !isSearchMode;

  // When grouping, reorder rows so that within each day they're bucketed by
  // category (categories in first-appearance order, time order kept inside each
  // bucket; day order preserved from the server's date sort). Each row carries
  // precomputed day/category labels and whether it starts a new day/category
  // group, so rendering stays a pure map (no render-time mutation).
  const displayRows = useMemo<
    {
      video: Video;
      dateLabel: string;
      category: string;
      showDay: boolean;
      showCategory: boolean;
    }[]
  >(() => {
    const labelOf = (v: Video) =>
      formatMeetingDate(v.scheduledTime ?? v.date, {
        shortWeekday: !groupByDate,
      });

    // In search mode rows stay as-is and no group headers are emitted.
    const ordered = rows.map((video) => ({
      video,
      dateLabel: labelOf(video),
      category: video.category ?? "",
    }));

    if (!groupByDate) {
      return ordered.map((r) => ({
        ...r,
        showDay: false,
        showCategory: false,
      }));
    }

    const dayOrder: string[] = [];
    const byDay = new Map<string, typeof ordered>();
    for (const r of ordered) {
      if (!byDay.has(r.dateLabel)) {
        byDay.set(r.dateLabel, []);
        dayOrder.push(r.dateLabel);
      }
      byDay.get(r.dateLabel)!.push(r);
    }

    const out: {
      video: Video;
      dateLabel: string;
      category: string;
      showDay: boolean;
      showCategory: boolean;
    }[] = [];
    for (const day of dayOrder) {
      const catOrder: string[] = [];
      const byCat = new Map<string, typeof ordered>();
      for (const r of byDay.get(day)!) {
        if (!byCat.has(r.category)) {
          byCat.set(r.category, []);
          catOrder.push(r.category);
        }
        byCat.get(r.category)!.push(r);
      }
      catOrder.sort(compareCategories);
      let firstOfDay = true;
      for (const cat of catOrder) {
        let firstOfCat = true;
        for (const r of byCat.get(cat)!) {
          out.push({
            ...r,
            showDay: firstOfDay,
            showCategory: firstOfDay || firstOfCat,
          });
          firstOfDay = false;
          firstOfCat = false;
        }
      }
    }
    return out;
  }, [rows, groupByDate, formatMeetingDate]);

  // Split the rows into per-day groups (one rendered table each) when grouping.
  type DisplayRow = (typeof displayRows)[number];
  const dayGroups = useMemo<
    { day: string; rows: DisplayRow[]; isFuture: boolean }[] | null
  >(() => {
    if (!groupByDate) return null;
    const groups: { day: string; rows: DisplayRow[]; isFuture: boolean }[] = [];
    for (const r of displayRows) {
      if (r.showDay || groups.length === 0) {
        const ts = r.video.scheduledTime ?? r.video.date;
        groups.push({
          day: r.dateLabel,
          rows: [],
          isFuture: isFutureDay(ts),
        });
      }
      groups[groups.length - 1].rows.push(r);
    }
    return groups;
  }, [displayRows, groupByDate, isFutureDay]);

  const futureDayGroups = (dayGroups ?? []).filter((g) => g.isFuture);
  const pastDayGroups = (dayGroups ?? []).filter((g) => !g.isFuture);
  // Server returns rows date-desc, so futureDayGroups is also descending —
  // flip it for the upcoming view so the soonest day is at the top.
  const upcomingDayGroups = useMemo(
    () => [...futureDayGroups].reverse(),
    [futureDayGroups],
  );
  const view: "recent" | "upcoming" =
    serverParams.view === "upcoming" ? "upcoming" : "recent";

  // Renders one meeting's table rows: an optional category subheader followed by
  // the data row. The day heading lives outside the table (one table per day).
  const renderMeetingRow = ({
    video,
    dateLabel,
    category,
    showCategory,
  }: DisplayRow) => {
    const isScheduled = video.status === "scheduled";
    const isLive = video.status === "live";
    const time = video.scheduledTime;
    const duration = formatDuration(video.duration);
    const activeCategory =
      (serverParams.category ?? []).length === 1 &&
      serverParams.category![0] === category;

    return (
      <Fragment key={video.slug}>
        {showCategory && (
          <tr className="bg-gray-50">
            <td colSpan={2} className="px-4 py-1.5">
              {category ? (
                <button
                  onClick={() =>
                    updateParams({
                      category: activeCategory ? undefined : [category],
                    })
                  }
                  className={cn(
                    typography.tableHeader,
                    "transition-colors hover:text-foreground",
                    activeCategory && "text-primary",
                  )}
                >
                  {tCategory(category)}
                </button>
              ) : (
                <span className={typography.tableHeader}>
                  {t("uncategorized")}
                </span>
              )}
            </td>
          </tr>
        )}
        <tr
          className={cn(
            "border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50",
            // Future/scheduled rows recede via the same muted-foreground tone
            // used by category headers and duration values — not opacity, which
            // produced a fourth grey shade out of sync with the rest.
            isScheduled && "text-muted-foreground",
          )}
        >
          {/* Date (search mode only — grouped mode shows it as a heading) */}
          {!groupByDate && (
            <td className="px-4 py-2.5 align-top whitespace-nowrap text-muted-foreground">
              {dateLabel}
            </td>
          )}
          {/* Time (always) + duration (≥sm only — too cramped on mobile) */}
          <td className="px-4 py-2.5 align-top">
            <div className="flex items-baseline justify-between gap-2 tabular-nums">
              {time ? (
                <span>{formatMeetingTime(time)}</span>
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
              <span className="hidden text-muted-foreground sm:inline">
                {duration ?? (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </span>
            </div>
          </td>
          {/* Title, prefixed with record badges */}
          <td className="relative px-4 py-2.5 align-top">
            {isLive && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    aria-label={t("liveTooltip")}
                    className="absolute left-1 top-4 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500"
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {t("liveTooltip")}
                </TooltipContent>
              </Tooltip>
            )}
            <DocChips
              hasTranscript={video.hasTranscript}
              hasTranscriptInLocale={video.hasTranscriptInLocale}
              pvAvailable={video.pvAvailable}
              pvSymbol={video.pvSymbol}
            />
            <Link
              href={`/${video.slug}`}
              className="underline-offset-2 hover:underline"
            >
              {video.cleanTitle}
            </Link>
          </td>
        </tr>
      </Fragment>
    );
  };

  // Day section: large heading + a per-day table of meeting rows. Used for
  // both past and (when expanded) future day groups.
  const renderDayGroup = (group: { day: string; rows: DisplayRow[] }) => (
    <div key={group.day}>
      <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
        {group.day}
      </h2>
      {/* Mobile: drop the bordered card so the table flows edge-to-edge and
          recovers the page-padding width. Desktop keeps the framed look. */}
      <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-lg sm:border sm:border-gray-200">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[72px] sm:w-[132px]" />
            <col />
          </colgroup>
          <tbody>{group.rows.map(renderMeetingRow)}</tbody>
        </table>
      </div>
    </div>
  );

  const searchStatus =
    isSearchMode && rows.length > 0
      ? hasMore
        ? `Showing ${rows.length.toLocaleString()} meetings`
        : `${totalCount.toLocaleString()} meetings in total`
      : null;

  const clearAllFilters = () =>
    updateParams({
      date: undefined,
      body: undefined,
      category: undefined,
      text: undefined,
      q: undefined,
    });

  const emptyState = (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground/40" />
      {isSearchMode ? (
        <>
          <p className="text-sm text-muted-foreground">
            No meetings match{" "}
            <span className="font-medium text-foreground">
              &ldquo;{serverParams.q}&rdquo;
            </span>
            .
          </p>
          <button
            onClick={() => submitSearch("")}
            className="text-sm text-un-blue-text underline-offset-4 hover:underline"
          >
            Clear search
          </button>
        </>
      ) : hasActiveFilters ? (
        <>
          <p className="text-sm text-muted-foreground">
            No meetings match the current filters.
          </p>
          <button
            onClick={clearAllFilters}
            className="text-sm text-un-blue-text underline-offset-4 hover:underline"
          >
            Clear all filters
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No meetings found.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Unified filter toolbar — search and controls on one row when space allows */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={submitSearch}
            isFocused={isSearchFocused}
            setIsFocused={setIsSearchFocused}
            className="min-w-[240px] flex-1"
          />
          <DateFilterPopover
            availableDates={availableDates}
            selectedDate={serverParams.date}
            onChange={(val) => updateParams({ date: val })}
          />
          <SegmentedToggle
            disabled={isSearchMode || !!serverParams.date}
            options={[
              {
                label: t("viewRecent"),
                active: view === "recent",
                onSelect: () => updateParams({ view: undefined }),
              },
              {
                label: t("viewUpcoming"),
                active: view === "upcoming",
                onSelect: () => updateParams({ view: "upcoming" }),
              },
            ]}
          />
          <SegmentedToggle
            options={[
              {
                label: t("viewAll"),
                active: !withTranscript,
                onSelect: () => updateParams({ text: undefined }),
              },
              {
                label: t("viewTranscribed"),
                active: withTranscript,
                onSelect: () => updateParams({ text: ALL_DOC_TYPES }),
              },
            ]}
          />
        </div>
        <CategoryFilterRows
          options={filterOptions.categories}
          selected={serverParams.category ?? []}
          onChange={(vals) =>
            updateParams({ category: vals.length ? vals : undefined })
          }
          counts={filterOptions.categoryCounts}
        />
        {localeFilterApplicable && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={includeOtherLangs}
              onChange={toggleIncludeOtherLangs}
              className="h-3.5 w-3.5 cursor-pointer accent-primary"
            />
            <span>
              {t("includeOtherLangs")}
              {/* Only show the count when strict mode is on AND there are
                  hidden rows to surface — otherwise the parenthetical is
                  noise. After toggling on we deliberately drop it so the user
                  isn't told "(N more)" while N rows are already visible. */}
              {!includeOtherLangs && otherLangsCount > 0 && (
                <span className="ms-1.5 text-xs text-muted-foreground/80">
                  ({t("includeOtherLangsCount", { count: otherLangsCount })})
                </span>
              )}
            </span>
          </label>
        )}
      </div>

      {/* Search results: count + sort (relevance vs date) */}
      {isSearchMode && (
        <div className="flex items-center justify-between gap-3">
          <div
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {searchStatus}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("sortBy")}
            </span>
            <SegmentedToggle options={searchSortOptions} />
          </div>
        </div>
      )}

      {/* Schedule: one table per day, with the day as a text heading */}
      <div>
        {showEmptyState ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            {emptyState}
          </div>
        ) : dayGroups ? (
          // When a specific date is picked, the Recent/Upcoming toggle is
          // disabled (rendered greyed-out above) and the past/future split is
          // bypassed — the date is the only filter that should matter.
          serverParams.date ? (
            <div className="space-y-10">{dayGroups.map(renderDayGroup)}</div>
          ) : view === "upcoming" ? (
            upcomingDayGroups.length > 0 ? (
              <div className="space-y-10">
                {upcomingDayGroups.map(renderDayGroup)}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 p-6 text-sm text-muted-foreground">
                {t("noUpcoming")}
              </div>
            )
          ) : (
            <div className="space-y-10">
              {pastDayGroups.map(renderDayGroup)}
            </div>
          )
        ) : (
          // Search mode: a single ungrouped table with a leading Date column.
          <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-lg sm:border sm:border-gray-200">
            <table className="w-full text-sm">
              <tbody>{displayRows.map(renderMeetingRow)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Infinite scroll: sentinel auto-loads the next chunk; the button is a
          fallback / explicit control. */}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-4">
          <button
            onClick={() => loadMore()}
            disabled={loadingMore}
            className="rounded-full border border-border px-6 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? t("loading") : t("loadMore")}
          </button>
        </div>
      )}
      {!hasMore && rows.length > 0 && (
        <div className="pt-4 text-center text-sm text-muted-foreground">
          {isSearchMode
            ? t("results", { count: rows.length })
            : t("meetings", { count: totalCount })}
        </div>
      )}
    </div>
  );
}
