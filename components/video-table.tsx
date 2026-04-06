"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, Filter, X, CalendarIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Video } from "@/lib/un-api";
import type { ServerParams } from "@/app/page";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "right" | "center";
  }
}

const columnHelper = createColumnHelper<Video>();

// Helper to get date at local midnight for comparison
function getLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Apply UN Web TV's fucked-up timezone workaround
// Their timestamps have incorrect timezone offsets, so they slice them off and treat as UTC
// Source: https://webtv.un.org/sites/default/files/js/js_dA57f4jZ0sYpTuwvbXRb5Fns6GZvR5BtfWCN9UflmWI.js
// Code: `const date_time=node.textContent.slice(0,19); let time=luxon.DateTime.fromISO(date_time,{'zone':'UTC'});`
function parseUNTimestamp(timestamp: string): Date {
  const dateTimeWithoutTz = timestamp.slice(0, 19); // Remove timezone offset
  return new Date(dateTimeWithoutTz + "Z"); // Append 'Z' to treat as UTC
}

function getDateLabel(date: Date): string {
  const now = new Date();
  const today = getLocalMidnight(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const videoDate = getLocalMidnight(date);

  if (videoDate.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (videoDate.getTime() === today.getTime()) return "Today";
  if (videoDate.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Helper to format date/time for card view
function formatDateTime(scheduledTime: string | null, date: string): string {
  const d = scheduledTime ? parseUNTimestamp(scheduledTime) : new Date(date);
  const dateStr = getDateLabel(d);
  if (!scheduledTime) return dateStr;
  const timeStr = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} ${timeStr}`;
}

// Helper to format duration for card view
function formatDuration(duration: string): string | null {
  if (!duration || duration === "00:00:00") return null;
  return duration.replace(/^0+:?/, "").replace(/^0/, "");
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

  // Build set of day timestamps that have videos
  const availableDays = useMemo(() => {
    const s = new Set<number>();
    availableDates.forEach((d) => s.add(getLocalMidnight(new Date(d + "T00:00:00")).getTime()));
    return s;
  }, [availableDates]);

  // Only enable days that have videos
  const disabledMatcher = (date: Date) =>
    !availableDays.has(getLocalMidnight(date).getTime());

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
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const isActive = selected.length > 0;
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

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
          <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  selected.includes(opt)
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {opt}
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

// Active filter pills display
function ActiveFilters({
  dateFilter,
  bodyFilter,
  categoryFilter,
  onClearDate,
  onClearBody,
  onClearCategory,
}: {
  dateFilter: string | undefined;
  bodyFilter: string[];
  categoryFilter: string[];
  onClearDate: () => void;
  onClearBody: (value: string) => void;
  onClearCategory: (value: string) => void;
}) {
  const hasAny =
    !!dateFilter || bodyFilter.length > 0 || categoryFilter.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dateFilter && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {getDateLabel(new Date(dateFilter + "T00:00:00"))}
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
    </div>
  );
}

interface VideoTableProps {
  videos: Video[];
  totalCount: number;
  serverParams: ServerParams;
  availableDates: string[];
  filterOptions: { bodies: string[]; categories: string[] };
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

  // Search state (client-side, uses /api/search)
  const [inputValue, setInputValue] = useState(serverParams.q || "");
  const [searchResults, setSearchResults] = useState<Video[] | null>(
    serverParams.q ? null : null, // will be populated by effect if q is set
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // URL-driven param updater
  const updateParams = useCallback(
    (updates: Partial<ServerParams> & { resetPage?: boolean }) => {
      const { resetPage = true, ...paramUpdates } = updates;
      const next = { ...serverParams, ...paramUpdates };
      if (resetPage && !("page" in paramUpdates)) {
        next.page = 1;
      }

      const sp = new URLSearchParams();
      if (next.page > 1) sp.set("page", String(next.page));
      if (next.pageSize !== 50) sp.set("pageSize", String(next.pageSize));
      if (next.sort !== "date_desc") sp.set("sort", next.sort);
      if (next.status !== "past") sp.set("status", next.status);
      if (next.date) sp.set("date", next.date);
      if (next.body?.length) sp.set("body", next.body.join(","));
      if (next.category?.length) sp.set("category", next.category.join(","));
      if (next.hasTranscript) sp.set("hasTranscript", "1");
      if (next.q) sp.set("q", next.q);

      router.push(sp.toString() ? `?${sp}` : "/", { scroll: false });
    },
    [serverParams, router],
  );

  // Sync search input from URL changes (back/forward)
  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    setInputValue(urlQuery);
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
    fetch(`/api/search?q=${encodeURIComponent(serverParams.q)}`)
      .then((res) => res.json())
      .then((data) => {
        setSearchResults(data.videos);
        setHasMoreResults(data.hasMore);
        setSearchOffset(data.videos.length);
      })
      .catch(() => setSearchResults(null))
      .finally(() => setIsSearching(false));
  }, [serverParams.q]);

  const loadMore = () => {
    if (!serverParams.q || isLoadingMore) return;
    setIsLoadingMore(true);
    fetch(
      `/api/search?q=${encodeURIComponent(serverParams.q)}&offset=${searchOffset}`,
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

  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    setInputValue(trimmed);
    if (trimmed) {
      updateParams({ q: trimmed });
    } else {
      // Clear search — remove q param, go back to normal view
      updateParams({ q: undefined });
      setSearchResults(null);
    }
  };

  // Data: use search results when searching, otherwise server-provided videos
  const tableData = searchResults ?? videos;
  const isSearchMode = !!serverParams.q;

  // Parse current sort state
  const [currentSortBy, currentSortDir] = serverParams.sort.split("_") as [
    string,
    "asc" | "desc",
  ];

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
      label: getDateLabel(new Date(dateStr + "T00:00:00")),
    }));
  }, [availableDates]);

  // Pagination
  const pageCount = Math.max(1, Math.ceil(totalCount / serverParams.pageSize));

  const columns = useMemo(
    () => [
      columnHelper.accessor("scheduledTime", {
        id: "date",
        header: "Date",
        cell: (info) => {
          const time = info.getValue();
          const date = time
            ? parseUNTimestamp(time)
            : new Date(info.row.original.date);
          return getDateLabel(date);
        },
        size: 120,
      }),
      columnHelper.accessor("scheduledTime", {
        id: "time",
        header: "Time",
        cell: (info) => {
          const time = info.getValue();
          if (!time) return <span className="text-muted-foreground/30">—</span>;
          const date = parseUNTimestamp(time);
          return (
            <span className="tabular-nums">
              {date.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          );
        },
        size: 70,
      }),
      columnHelper.accessor("duration", {
        header: "Duration",
        cell: (info) => {
          const duration = info.getValue();
          if (!duration || duration === "00:00:00")
            return <span className="text-muted-foreground/30">—</span>;
          return (
            <span className="tabular-nums">
              {duration.replace(/^0+:?/, "").replace(/^0/, "")}
            </span>
          );
        },
        size: 80,
        maxSize: 80,
        meta: {
          align: "right" as const,
        },
      }),
      columnHelper.accessor("cleanTitle", {
        header: "Title",
        cell: (info) => {
          const encodedId = encodeURIComponent(info.row.original.id);
          const isScheduled = info.row.original.status === "scheduled";
          const isLive = info.row.original.status === "live";
          const hasTranscript = info.row.original.hasTranscript;
          const hasPV = !!info.row.original.pvSymbol;
          return (
            <a
              href={`/video/${encodedId}`}
              className={`underline-offset-2 hover:underline ${isScheduled ? "text-muted-foreground" : "text-foreground"}`}
            >
              {isLive && (
                <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
              )}
              {hasTranscript && (
                <span className="mr-2 inline-block rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary align-middle">
                  TRANSCRIBED
                </span>
              )}
              {hasPV && (
                <span className="mr-2 inline-block rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-700 align-middle">
                  PV
                </span>
              )}
              {info.getValue()}
            </a>
          );
        },
        size: 400,
      }),
      columnHelper.accessor("body", {
        header: "Body",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
        size: 140,
      }),
      columnHelper.accessor("category", {
        header: "Category",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
        size: 140,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Desktop: Search bar with count */}
      <div className="hidden items-center gap-4 lg:flex">
        <div className="relative w-1/2">
          <input
            type="text"
            placeholder="Search all columns… (press Enter)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch(inputValue)}
            onBlur={() => submitSearch(inputValue)}
            className="w-full rounded-full border border-border bg-muted/30 px-4 py-2 text-sm transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/10 focus:outline-none"
          />
          {inputValue && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                submitSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-medium shadow-xs">
          <button
            onClick={() =>
              serverParams.status !== "past" &&
              updateParams({ status: "past" })
            }
            className={`rounded-full px-4 py-1.5 transition-all ${serverParams.status !== "scheduled" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Past
          </button>
          <button
            onClick={() =>
              serverParams.status !== "scheduled" &&
              updateParams({ status: "scheduled", sort: "date_asc" })
            }
            className={`rounded-full px-4 py-1.5 transition-all ${serverParams.status === "scheduled" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Scheduled
          </button>
        </div>
        <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-medium shadow-xs">
          <button
            onClick={() =>
              serverParams.hasTranscript &&
              updateParams({ hasTranscript: undefined })
            }
            className={`rounded-full px-4 py-1.5 transition-all ${!serverParams.hasTranscript ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          <button
            onClick={() =>
              !serverParams.hasTranscript &&
              updateParams({ hasTranscript: true })
            }
            className={`rounded-full px-4 py-1.5 transition-all ${serverParams.hasTranscript ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Transcribed
          </button>
        </div>
        <div className="ml-auto text-sm whitespace-nowrap text-muted-foreground">
          {isSearching
            ? "Searching…"
            : isSearchMode && searchResults !== null
              ? hasMoreResults
                ? `Showing ${searchResults.length} meetings`
                : `${searchResults.length} meetings in total`
              : totalCount > 0
                ? `${totalCount} meetings`
                : null}
        </div>
      </div>

      {/* Active filter pills */}
      <ActiveFilters
        dateFilter={serverParams.date}
        bodyFilter={serverParams.body ?? []}
        categoryFilter={serverParams.category ?? []}
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
      />

      {/* Mobile: All filters grouped */}
      <div className="space-y-3 lg:hidden">
        <div className="relative">
          <input
            type="text"
            placeholder="Search… (press Enter)"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch(inputValue)}
            onBlur={() => submitSearch(inputValue)}
            className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:bg-background focus:outline-none"
          />
          {inputValue && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                submitSearch("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={serverParams.date ?? ""}
            onChange={(e) =>
              updateParams({ date: e.target.value || undefined })
            }
            className="min-w-[120px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
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
              updateParams({ body: e.target.value ? [e.target.value] : undefined })
            }
            className="min-w-[120px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Bodies</option>
            {filterOptions.bodies.map((body) => (
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
            className="min-w-[120px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
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
          <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={!!serverParams.hasTranscript}
              onChange={(e) =>
                updateParams({
                  hasTranscript: e.target.checked ? true : undefined,
                })
              }
              className="h-4 w-4 rounded border-gray-300 accent-primary"
            />
            <span className="text-muted-foreground">With transcript</span>
          </label>
          <div className="flex rounded-md bg-muted p-0.5 text-xs font-medium">
            <button
              onClick={() =>
                serverParams.status !== "past" &&
                updateParams({ status: "past" })
              }
              className={`rounded px-3 py-1.5 transition-colors ${serverParams.status !== "scheduled" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Past
            </button>
            <button
              onClick={() =>
                serverParams.status !== "scheduled" &&
                updateParams({ status: "scheduled", sort: "date_asc" })
              }
              className={`rounded px-3 py-1.5 transition-colors ${serverParams.status === "scheduled" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Scheduled
            </button>
          </div>
        </div>
      </div>

      {/* "Back to recent" banner */}
      {isSearchMode && (
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          <span>Showing historical results</span>
          <button
            onClick={() => submitSearch("")}
            className="text-primary hover:underline"
          >
            Clear to return to recent meetings
          </button>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="grid gap-3 lg:hidden">
        {table.getRowModel().rows.map((row) => {
          const video = row.original;
          const isLive = video.status === "live";
          const isScheduled = video.status === "scheduled";
          const duration = formatDuration(video.duration);
          const dateTime = formatDateTime(video.scheduledTime, video.date);

          return (
            <a
              key={row.id}
              href={`/video/${encodeURIComponent(video.id)}`}
              className={`block rounded-lg border p-4 transition-colors hover:bg-muted/50 ${isScheduled ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`text-sm leading-tight ${isScheduled ? "text-muted-foreground" : "text-primary"}`}
                >
                  {video.cleanTitle}
                  {video.hasTranscript && (
                    <span className="ml-2 inline-block rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary align-middle">
                      transcribed
                    </span>
                  )}
                  {video.pvSymbol && (
                    <span className="ml-2 inline-block rounded bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-700 align-middle">
                      PV
                    </span>
                  )}
                </span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {isLive ? (
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  ) : (
                    duration && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {duration}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                {/* Date */}
                <th
                  className="px-4 py-2 text-left text-[10px] font-medium tracking-wider text-gray-400 uppercase"
                  style={{ width: 120, minWidth: 120, maxWidth: 120 }}
                >
                  <div className="flex items-center gap-1">
                    <span>Date</span>
                    <DateFilterPopover
                      availableDates={availableDates}
                      selectedDate={serverParams.date}
                      onChange={(val) => updateParams({ date: val })}
                    />
                    <SortArrow
                      active={currentSortBy === "date"}
                      direction={currentSortBy === "date" ? currentSortDir : "desc"}
                      onClick={() => toggleSort("date")}
                    />
                  </div>
                </th>
                {/* Time */}
                <th
                  className="px-4 py-2 text-left text-[10px] font-medium tracking-wider text-gray-400 uppercase"
                  style={{ width: 70, minWidth: 70, maxWidth: 70 }}
                >
                  <span>Time</span>
                </th>
                {/* Duration */}
                <th
                  className="px-4 py-2 text-right text-[10px] font-medium tracking-wider text-gray-400 uppercase"
                  style={{ width: 80, minWidth: 80, maxWidth: 80 }}
                >
                  <span>Duration</span>
                </th>
                {/* Title */}
                <th className="px-4 py-2 text-left text-[10px] font-medium tracking-wider text-gray-400 uppercase">
                  <div className="flex items-center gap-1">
                    <span>Title</span>
                    <SortArrow
                      active={currentSortBy === "title"}
                      direction={currentSortBy === "title" ? currentSortDir : "asc"}
                      onClick={() => toggleSort("title")}
                    />
                  </div>
                </th>
                {/* Body */}
                <th
                  className="px-4 py-2 text-left text-[10px] font-medium tracking-wider text-gray-400 uppercase"
                  style={{ width: 140, minWidth: 140, maxWidth: 140 }}
                >
                  <div className="flex items-center gap-1">
                    <span>Body</span>
                    <MultiFilterPopover
                      options={filterOptions.bodies}
                      selected={serverParams.body ?? []}
                      onChange={(vals) =>
                        updateParams({ body: vals.length ? vals : undefined })
                      }
                    />
                  </div>
                </th>
                {/* Category */}
                <th
                  className="px-4 py-2 text-left text-[10px] font-medium tracking-wider text-gray-400 uppercase"
                  style={{ width: 140, minWidth: 140, maxWidth: 140 }}
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
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isScheduled = row.original.status === "scheduled";
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50 ${isScheduled ? "opacity-40" : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const align = cell.column.columnDef.meta?.align;
                      return (
                        <td
                          key={cell.id}
                          className={`px-4 py-3 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
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
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-0.5">
            <button
              onClick={() => updateParams({ page: 1, resetPage: false })}
              disabled={serverParams.page <= 1}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              ««
            </button>
            <button
              onClick={() =>
                updateParams({
                  page: serverParams.page - 1,
                  resetPage: false,
                })
              }
              disabled={serverParams.page <= 1}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              «
            </button>
            <button
              onClick={() =>
                updateParams({
                  page: serverParams.page + 1,
                  resetPage: false,
                })
              }
              disabled={serverParams.page >= pageCount}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              »
            </button>
            <button
              onClick={() =>
                updateParams({ page: pageCount, resetPage: false })
              }
              disabled={serverParams.page >= pageCount}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              »»
            </button>
          </div>

          <div className="text-sm text-muted-foreground">
            Page {serverParams.page} of {pageCount}
          </div>

          <select
            value={serverParams.pageSize}
            onChange={(e) =>
              updateParams({ pageSize: Number(e.target.value) })
            }
            className="rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm text-muted-foreground focus:border-primary/50 focus:outline-none"
          >
            {[25, 50, 100, 200].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                Show {pageSize}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
