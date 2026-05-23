"use client";

import type { ServerParams } from "@/app/page";
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
import {
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Filter,
  Info,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTimezone } from "@/lib/hooks/use-timezone";
import { rememberScheduleUrl } from "@/lib/schedule-return";
import {
  formatMeetingTime,
  formatMeetingDate,
  formatMeetingDateTime,
} from "@/lib/timezone";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const BODY_ORDER: Record<string, number> = {
  "General Assembly": 0,
  "Security Council": 1,
  "Economic and Social Council": 2,
  "Trusteeship Council": 3,
  "First Committee": 4,
  "Second Committee": 5,
  "Third Committee": 6,
  "Fourth Committee": 7,
  "Fifth Committee": 8,
  "Sixth Committee": 9,
};

function sortBodies(bodies: string[]): string[] {
  return [...bodies].sort(
    (a, b) => (BODY_ORDER[a] ?? 99) - (BODY_ORDER[b] ?? 99),
  );
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

function DateFilterPopover({
  availableDates,
  selectedDate,
  onChange,
}: {
  availableDates: string[];
  selectedDate: string | undefined;
  onChange: (date: string | undefined) => void;
}) {
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
      <PopoverTrigger
        className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
          isActive
            ? "bg-primary text-white"
            : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        }`}
      >
        <CalendarIcon className="h-3 w-3" />
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

function MultiFilterPopover({
  options,
  selected,
  onChange,
  counts,
  labels,
  tooltips,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  counts?: Record<string, number>;
  labels?: Record<string, string>;
  tooltips?: Record<string, string>;
}) {
  const isActive = selected.length > 0;
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  // When counts are available, show the most common options first.
  const sortedOptions = counts
    ? [...options].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
    : options;

  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
          isActive
            ? "bg-primary text-white"
            : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        }`}
      >
        <Filter className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mb-2 flex w-full items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" /> Clear {selected.length} selected
            </button>
          )}
          <div className="flex flex-wrap gap-1.5">
            {sortedOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  selected.includes(opt)
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {labels?.[opt] ?? opt}
                {counts?.[opt] !== undefined && (
                  <span className="ml-1 opacity-50">{counts[opt]}</span>
                )}
                {tooltips?.[opt] && (
                  <Tooltip>
                    <TooltipTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info
                        className={`h-3 w-3 shrink-0 cursor-help ${
                          selected.includes(opt)
                            ? "opacity-60 hover:opacity-100"
                            : "text-gray-400 hover:text-gray-600"
                        }`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-56 text-xs">
                      {tooltips[opt]}
                    </TooltipContent>
                  </Tooltip>
                )}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortArrow({
  active,
  direction,
  onClick,
}: {
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="transition-colors hover:text-gray-600">
      {active && direction === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5 text-primary" />
      ) : active && direction === "desc" ? (
        <ChevronDown className="h-3.5 w-3.5 text-primary" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
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
  const highlighted = isFocused || value.trim().length > 0;
  return (
    <div className={`group relative ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search
          className={`h-4 w-4 transition-colors ${highlighted ? "text-un-blue" : "text-slate-400 group-hover:text-un-blue"}`}
          aria-hidden="true"
        />
      </div>
      <input
        type="text"
        placeholder="Search all meetings…"
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
        className={`block h-10 w-full touch-manipulation rounded-lg border px-3 pl-9 text-sm transition-colors focus:outline-none ${
          highlighted
            ? "border-un-blue bg-un-blue/5 text-un-blue placeholder-un-blue/50"
            : "border-slate-300 bg-white text-slate-400 placeholder-slate-400 hover:border-un-blue hover:text-un-blue hover:placeholder-un-blue/70"
        }`}
      />
      {value && (
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            onSubmit("");
          }}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-un-blue/50 hover:text-un-blue"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Document-availability badges (AI transcript / verbatim / summary record).
// Used in both the desktop table cell and the mobile card; `uppercase` is the
// only visual difference between the two.
function DocBadges({
  hasTranscript,
  pvAvailable,
  pvSymbol,
  uppercase,
}: {
  hasTranscript: boolean;
  pvAvailable: boolean;
  pvSymbol: string | null;
  uppercase?: boolean;
}) {
  if (!hasTranscript && !pvAvailable) return null;
  const isSR = pvSymbol?.includes("/SR.");
  const caseClass = uppercase ? "uppercase" : "";
  return (
    <div className="flex flex-wrap gap-1">
      {hasTranscript && (
        <span
          className={`inline-block rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary ${caseClass}`}
        >
          transcript
        </span>
      )}
      {pvAvailable && (
        <span
          className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ${caseClass} ${
            isSR
              ? "bg-violet-500/10 text-violet-700"
              : "bg-amber-500/10 text-amber-700"
          }`}
        >
          {isSR ? "summary" : "verbatim"}
        </span>
      )}
    </div>
  );
}

// Compact letter chips for the desktop Transcripts column: T (AI transcript),
// V (verbatim record), S (summary record). Color matches DocBadges; the full
// name is in a hover tooltip. Letters distinguish the three types far more
// legibly than icons would at this size.
function DocChips({
  hasTranscript,
  pvAvailable,
  pvSymbol,
}: {
  hasTranscript: boolean;
  pvAvailable: boolean;
  pvSymbol: string | null;
}) {
  if (!hasTranscript && !pvAvailable) return null;
  const isSR = pvSymbol?.includes("/SR.");
  const chips: { letter: string; label: string; className: string }[] = [];
  if (hasTranscript) {
    chips.push({
      letter: "T",
      label: DOCS_TOOLTIPS.transcript,
      className: "bg-primary/10 text-primary",
    });
  }
  if (pvAvailable) {
    chips.push(
      isSR
        ? {
            letter: "S",
            label: DOCS_TOOLTIPS.sr,
            className: "bg-violet-500/10 text-violet-700",
          }
        : {
            letter: "V",
            label: DOCS_TOOLTIPS.pv,
            className: "bg-amber-500/10 text-amber-700",
          },
    );
  }
  return (
    <div className="flex gap-1">
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
    </div>
  );
}

// Binary/segmented toggle (e.g. Recent/Scheduled, All/Transcribed). Shared by
// the desktop and mobile filter bars so both stay visually identical.
function SegmentedToggle({
  options,
}: {
  options: { label: string; active: boolean; onSelect: () => void }[];
}) {
  return (
    <div className="flex h-10 rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-medium">
      {options.map(({ label, active, onSelect }) => (
        <button
          key={label}
          onClick={() => !active && onSelect()}
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

const DOCS_LABELS: Record<string, string> = {
  transcript: "Transcript",
  pv: "Verbatim Record",
  sr: "Summary Record",
};

const DOCS_TOOLTIPS: Record<string, string> = {
  transcript: "AI-generated transcript from the audio recording",
  pv: "Official word-for-word record of the meeting, produced by the UN Secretariat",
  sr: "Official condensed record of the meeting, produced by the UN Secretariat",
};

// Active filter pills display
function ActiveFilters({
  dateFilter,
  bodyFilter,
  categoryFilter,
  textFilter,
  searchQuery,
  onClearDate,
  onClearBody,
  onClearCategory,
  onClearDocs,
  onClearSearch,
}: {
  dateFilter: string | undefined;
  bodyFilter: string[];
  categoryFilter: string[];
  textFilter: string[];
  searchQuery?: string;
  onClearDate: () => void;
  onClearBody: (value: string) => void;
  onClearCategory: (value: string) => void;
  onClearDocs: (value: string) => void;
  onClearSearch: () => void;
}) {
  const { timezone } = useTimezone();
  const hasAny =
    !!dateFilter ||
    bodyFilter.length > 0 ||
    categoryFilter.length > 0 ||
    textFilter.length > 0 ||
    !!searchQuery;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dateFilter && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {formatMeetingDate(dateFilter, timezone)}
          <button onClick={onClearDate} className="hover:text-primary/70">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      {bodyFilter.map((b) => (
        <span
          key={b}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {b}
          <button
            onClick={() => onClearBody(b)}
            className="hover:text-primary/70"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {categoryFilter.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {c}
          <button
            onClick={() => onClearCategory(c)}
            className="hover:text-primary/70"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {textFilter.map((d) => (
        <span
          key={d}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
        >
          {DOCS_LABELS[d] || d}
          <button
            onClick={() => onClearDocs(d)}
            className="hover:text-primary/70"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {searchQuery && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          &ldquo;{searchQuery}&rdquo;
          <button onClick={onClearSearch} className="hover:text-primary/70">
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  );
}

interface VideoTableProps {
  videos: Video[];
  totalCount: number;
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
  serverParams,
  availableDates,
  filterOptions,
}: VideoTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { timezone } = useTimezone();

  const sortedBodies = useMemo(
    () => sortBodies(filterOptions.bodies),
    [filterOptions.bodies],
  );

  // Search state (client-side, uses /api/search)
  const [inputValue, setInputValue] = useState(serverParams.q || "");
  const [searchResults, setSearchResults] = useState<Video[] | null>(
    serverParams.q ? null : null, // will be populated by effect if q is set
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
      if (next.status !== "past") sp.set("status", next.status);
      if (next.date) sp.set("date", next.date);
      next.body?.forEach((v) => sp.append("body", v));
      next.category?.forEach((v) => sp.append("category", v));
      next.text?.forEach((v) => sp.append("text", v));
      if (next.q) sp.set("q", next.q);

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

  // Fetch search results when q param is set
  useEffect(() => {
    if (!serverParams.q) {
      setSearchResults(null);
      setSearchOffset(0);
      setHasMoreResults(false);
      return;
    }

    setIsSearching(true);
    setSearchOffset(0);
    const sortParam = serverParams.sort ? `&sort=${serverParams.sort}` : "";
    fetch(`/api/search?q=${encodeURIComponent(serverParams.q)}${sortParam}`)
      .then((res) => res.json())
      .then((data) => {
        setSearchResults(data.videos);
        setHasMoreResults(data.hasMore);
        setSearchOffset(data.videos.length);
      })
      .catch(() => setSearchResults(null))
      .finally(() => setIsSearching(false));
  }, [serverParams.q, serverParams.sort]);

  const loadMore = () => {
    if (!serverParams.q || isLoadingMore) return;
    setIsLoadingMore(true);
    const sortParam = serverParams.sort ? `&sort=${serverParams.sort}` : "";
    fetch(
      `/api/search?q=${encodeURIComponent(serverParams.q)}&offset=${searchOffset}${sortParam}`,
    )
      .then((res) => res.json())
      .then((data) => {
        setSearchResults((prev) => [...(prev ?? []), ...data.videos]);
        setHasMoreResults(data.hasMore);
        setSearchOffset((prev) => prev + data.videos.length);
      })
      .catch(() => {})
      .finally(() => setIsLoadingMore(false));
  };

  // Immediate flush (Enter / blur / clear) — bypasses the debounce. Uses
  // replace() like the live-search path so search never floods history.
  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    setInputValue(trimmed);
    if (trimmed === lastWrittenQuery.current) return;
    lastWrittenQuery.current = trimmed;
    if (trimmed) {
      updateParams({ q: trimmed, replace: true });
    } else {
      // Clear search — remove q param, go back to normal view
      updateParams({ q: undefined, replace: true });
      setSearchResults(null);
    }
  };

  // Data: use search results when searching, otherwise server-provided videos
  const tableData = searchResults ?? videos;
  const isSearchMode = !!serverParams.q;

  // Coarse "With transcript" toggle: on when every doc type is selected (any
  // of transcript / PV / SR counts as a transcript).
  const withTranscript = ALL_DOC_TYPES.every((d) =>
    (serverParams.text ?? []).includes(d),
  );
  const toggleWithTranscript = () =>
    updateParams({ text: withTranscript ? undefined : ALL_DOC_TYPES });

  const isScheduledView = serverParams.status === "scheduled";
  const statusToggleOptions = [
    {
      label: "Recent",
      active: !isScheduledView,
      onSelect: () => updateParams({ status: "past" }),
    },
    {
      label: "Upcoming",
      active: isScheduledView,
      onSelect: () => updateParams({ status: "scheduled", sort: "date_asc" }),
    },
  ];
  const transcribedToggleOptions = [
    { label: "All", active: !withTranscript, onSelect: toggleWithTranscript },
    {
      label: "Transcribed",
      active: withTranscript,
      onSelect: toggleWithTranscript,
    },
  ];

  // Parse current sort state (undefined = auto, no column actively sorted)
  const [currentSortBy, currentSortDir] = (
    serverParams.sort ? serverParams.sort.split("_") : [undefined, undefined]
  ) as [string | undefined, "asc" | "desc" | undefined];

  const toggleSort = (column: "date" | "title") => {
    if (currentSortBy === column) {
      updateParams({
        sort: `${column}_${currentSortDir === "desc" ? "asc" : "desc"}`,
      });
    } else {
      updateParams({
        sort: `${column}_${column === "date" ? "desc" : "asc"}`,
      });
    }
  };

  // Mobile date options from availableDates
  const mobileDateOptions = useMemo(() => {
    return availableDates.map((dateStr) => ({
      value: dateStr,
      label: formatMeetingDate(dateStr, timezone),
    }));
  }, [availableDates, timezone]);

  // Pagination
  const pageCount = Math.max(1, Math.ceil(totalCount / serverParams.pageSize));

  const rows = tableData;
  const hasActiveFilters =
    !!serverParams.date ||
    (serverParams.body?.length ?? 0) > 0 ||
    (serverParams.category?.length ?? 0) > 0 ||
    (serverParams.text?.length ?? 0) > 0;
  // Don't flash "no results" while a search request is still in flight.
  const showEmptyState = rows.length === 0 && !isSearching;
  // Day-separator grouping only makes sense when rows are in date order;
  // relevance-sorted search results would fragment into 1-row groups.
  const groupByDate = !isSearchMode;

  const searchStatus = isSearching
    ? "Searching…"
    : isSearchMode && searchResults !== null && searchResults.length > 0
      ? hasMoreResults
        ? `Showing ${searchResults.length.toLocaleString()} meetings`
        : `${searchResults.length.toLocaleString()} meetings in total`
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
            className="text-sm text-un-blue underline-offset-4 hover:underline"
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
            className="text-sm text-un-blue underline-offset-4 hover:underline"
          >
            Clear all filters
          </button>
        </>
      ) : isScheduledView ? (
        <p className="text-sm text-muted-foreground">
          No upcoming meetings are scheduled right now. Check back soon, or
          switch to{" "}
          <button
            onClick={() => updateParams({ status: "past" })}
            className="text-un-blue underline-offset-4 hover:underline"
          >
            recent meetings
          </button>
          .
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No meetings found.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Desktop: search fills the row; toggles grouped flush right */}
      <div className="hidden items-center gap-3 lg:flex">
        <SearchInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={submitSearch}
          isFocused={isSearchFocused}
          setIsFocused={setIsSearchFocused}
          className="flex-1"
        />
        <SegmentedToggle options={statusToggleOptions} />
        <SegmentedToggle options={transcribedToggleOptions} />
      </div>

      {/* Search result count / status (only while searching) */}
      {searchStatus && (
        <div className="hidden text-sm text-muted-foreground lg:block">
          {searchStatus}
        </div>
      )}

      {/* Active filter pills */}
      <ActiveFilters
        dateFilter={serverParams.date}
        bodyFilter={serverParams.body ?? []}
        categoryFilter={serverParams.category ?? []}
        textFilter={serverParams.text ?? []}
        searchQuery={serverParams.q}
        onClearDate={() => updateParams({ date: undefined })}
        onClearBody={(v) =>
          updateParams({
            body: (serverParams.body ?? []).filter((b) => b !== v),
          })
        }
        onClearCategory={(v) =>
          updateParams({
            category: (serverParams.category ?? []).filter((c) => c !== v),
          })
        }
        onClearDocs={(v) =>
          updateParams({
            text: (serverParams.text ?? []).filter((d) => d !== v),
          })
        }
        onClearSearch={() => submitSearch("")}
      />

      {/* Mobile: All filters grouped */}
      <div className="space-y-3 lg:hidden">
        <SearchInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={submitSearch}
          isFocused={isSearchFocused}
          setIsFocused={setIsSearchFocused}
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={serverParams.date ?? ""}
            onChange={(e) =>
              updateParams({ date: e.target.value || undefined })
            }
            className="min-w-30 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Dates</option>
            {mobileDateOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={(serverParams.body ?? [])[0] || ""}
            onChange={(e) =>
              updateParams({
                body: e.target.value ? [e.target.value] : undefined,
              })
            }
            className="min-w-30 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Bodies</option>
            {sortedBodies.map((body) => (
              <option key={body} value={body}>
                {body}
              </option>
            ))}
          </select>
          <select
            value={(serverParams.category ?? [])[0] || ""}
            onChange={(e) =>
              updateParams({
                category: e.target.value ? [e.target.value] : undefined,
              })
            }
            className="min-w-30 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {filterOptions.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={(serverParams.text ?? [])[0] || ""}
            onChange={(e) =>
              updateParams({
                text: e.target.value ? [e.target.value] : undefined,
              })
            }
            className="min-w-30 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Text</option>
            <option value="transcript">Transcript</option>
            <option value="pv">Verbatim Record</option>
            <option value="sr">Summary Record</option>
          </select>
          <SegmentedToggle options={statusToggleOptions} />
          <SegmentedToggle options={transcribedToggleOptions} />
        </div>
      </div>

      {/* Mobile Card View */}
      {showEmptyState && <div className="lg:hidden">{emptyState}</div>}
      <div className={cn("grid gap-3 lg:hidden", showEmptyState && "hidden")}>
        {rows.map((video) => {
          const isLive = video.status === "live";
          const isScheduled = video.status === "scheduled";
          const duration = formatDuration(video.duration);
          const dateTime = formatMeetingDateTime(
            video.scheduledTime,
            video.date,
            timezone,
          );

          return (
            <a
              key={video.slug}
              href={`/${video.slug}`}
              className={`block rounded-lg border p-4 transition-colors hover:bg-muted/50 ${isScheduled ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span
                    className={`text-sm leading-tight ${isScheduled ? "text-muted-foreground" : "text-primary"}`}
                  >
                    {video.cleanTitle}
                  </span>
                  <DocBadges
                    hasTranscript={video.hasTranscript}
                    pvAvailable={video.pvAvailable}
                    pvSymbol={video.pvSymbol}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isLive ? (
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  ) : (
                    duration && (
                      <span className={cn(typography.caption, "tabular-nums")}>
                        {duration}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div
                className={cn(
                  typography.caption,
                  "mt-2 flex flex-wrap gap-x-3 gap-y-1",
                )}
              >
                <span>{dateTime}</span>
                {video.body && <span>• {video.body}</span>}
                {video.category && <span>• {video.category}</span>}
              </div>
            </a>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 lg:block">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {/* Time (date + clock + duration) */}
                <th
                  className={cn(typography.tableHeader, "px-4 py-2 text-left")}
                  style={{ width: 140, minWidth: 140, maxWidth: 140 }}
                >
                  <div className="flex items-center gap-1">
                    <span>Time</span>
                    <DateFilterPopover
                      availableDates={availableDates}
                      selectedDate={serverParams.date}
                      onChange={(val) => updateParams({ date: val })}
                    />
                    <SortArrow
                      active={currentSortBy === "date"}
                      direction={
                        currentSortBy === "date"
                          ? (currentSortDir ?? "desc")
                          : "desc"
                      }
                      onClick={() => toggleSort("date")}
                    />
                  </div>
                </th>
                {/* Title */}
                <th
                  className={cn(typography.tableHeader, "px-4 py-2 text-left")}
                >
                  <div className="flex items-center gap-1">
                    <span>Title</span>
                    <SortArrow
                      active={currentSortBy === "title"}
                      direction={
                        currentSortBy === "title"
                          ? (currentSortDir ?? "asc")
                          : "asc"
                      }
                      onClick={() => toggleSort("title")}
                    />
                  </div>
                </th>
                {/* Category */}
                <th
                  className={cn(typography.tableHeader, "px-4 py-2 text-left")}
                  style={{ width: 190, minWidth: 190, maxWidth: 190 }}
                >
                  <div className="flex items-center gap-1">
                    <span>Category</span>
                    <MultiFilterPopover
                      options={filterOptions.categories}
                      selected={serverParams.category ?? []}
                      onChange={(vals) =>
                        updateParams({
                          category: vals.length ? vals : undefined,
                        })
                      }
                      counts={filterOptions.categoryCounts}
                    />
                  </div>
                </th>
                {/* Records (T / V / S chips) */}
                <th
                  className={cn(typography.tableHeader, "px-3 py-2 text-left")}
                  style={{ width: 84, minWidth: 84, maxWidth: 84 }}
                >
                  <div className="flex items-center gap-1">
                    <span>Docs</span>
                    <MultiFilterPopover
                      options={["transcript", "pv", "sr"]}
                      selected={serverParams.text ?? []}
                      onChange={(vals) =>
                        updateParams({ text: vals.length ? vals : undefined })
                      }
                      labels={DOCS_LABELS}
                      tooltips={DOCS_TOOLTIPS}
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {showEmptyState && (
                <tr>
                  <td colSpan={4}>{emptyState}</td>
                </tr>
              )}
              {(() => {
                // Group consecutive rows by day (only when results are in date
                // order — relevance-sorted search results aren't grouped).
                let lastDate: string | null = null;
                return rows.map((video) => {
                  const isScheduled = video.status === "scheduled";
                  const isLive = video.status === "live";
                  const time = video.scheduledTime;
                  const dateLabel = formatMeetingDate(
                    time ?? video.date,
                    timezone,
                  );
                  const duration = formatDuration(video.duration);
                  const showSeparator = groupByDate && dateLabel !== lastDate;
                  lastDate = dateLabel;

                  return (
                    <Fragment key={video.slug}>
                      {showSeparator && (
                        <tr className="border-y border-gray-200 bg-gray-100">
                          <td
                            colSpan={4}
                            className="px-4 py-2 text-sm font-semibold text-foreground"
                          >
                            {dateLabel}
                          </td>
                        </tr>
                      )}
                      <tr
                        onClick={() => router.push(`/${video.slug}`)}
                        className={cn(
                          "cursor-pointer border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50",
                          isScheduled && "opacity-40",
                        )}
                      >
                        {/* Time + duration */}
                        <td className="px-4 py-2.5 align-top">
                          {!groupByDate && (
                            <div className="text-xs text-muted-foreground">
                              {dateLabel}
                            </div>
                          )}
                          <div className="flex items-baseline justify-between gap-2 tabular-nums">
                            {time ? (
                              <span>{formatMeetingTime(time, timezone)}</span>
                            ) : (
                              <span className="text-black/20">—</span>
                            )}
                            {duration ? (
                              <span className="text-muted-foreground">
                                {duration}
                              </span>
                            ) : (
                              <span className="text-black/20">—</span>
                            )}
                          </div>
                        </td>
                        {/* Title */}
                        <td className="px-4 py-2.5 align-top">
                          <a
                            href={`/${video.slug}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-black underline-offset-2 hover:underline"
                          >
                            {isLive && (
                              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
                            )}
                            {video.cleanTitle}
                          </a>
                        </td>
                        {/* Category */}
                        <td className="px-4 py-2.5 align-top">
                          {video.category && (
                            <div className="truncate text-muted-foreground">
                              {video.category}
                            </div>
                          )}
                        </td>
                        {/* Records */}
                        <td className="px-3 py-2.5 align-top">
                          <DocChips
                            hasTranscript={video.hasTranscript}
                            pvAvailable={video.pvAvailable}
                            pvSymbol={video.pvSymbol}
                          />
                        </td>
                      </tr>
                    </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load more (search mode) */}
      {isSearchMode && searchResults !== null && hasMoreResults && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="rounded-full border border-border px-6 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Pagination (non-search mode) */}
      {!isSearchMode && (
        <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={serverParams.pageSize}
              onChange={(e) =>
                updateParams({ pageSize: Number(e.target.value) })
              }
              className="rounded-lg border border-border/60 bg-transparent px-2 py-1 text-sm text-muted-foreground focus:border-primary/50 focus:outline-none"
            >
              {[25, 50, 100, 200].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
            <span>per page</span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              Page {serverParams.page} of {pageCount} (
              {totalCount.toLocaleString()} items)
            </span>
            <div className="flex gap-0.5">
              <button
                onClick={() => updateParams({ page: 1, resetPage: false })}
                disabled={serverParams.page <= 1}
                aria-label="First page"
                className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  updateParams({
                    page: serverParams.page - 1,
                    resetPage: false,
                  })
                }
                disabled={serverParams.page <= 1}
                aria-label="Previous page"
                className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  updateParams({
                    page: serverParams.page + 1,
                    resetPage: false,
                  })
                }
                disabled={serverParams.page >= pageCount}
                aria-label="Next page"
                className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  updateParams({ page: pageCount, resetPage: false })
                }
                disabled={serverParams.page >= pageCount}
                aria-label="Last page"
                className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
