"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, Filter, X, CalendarIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Video } from "@/lib/un-api";

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
  videoDates,
  selectedDate,
  onChange,
}: {
  videoDates: Date[];
  selectedDate: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  const isActive = !!selectedDate;

  // Build set of day timestamps that have videos
  const availableDays = useMemo(() => {
    const s = new Set<number>();
    videoDates.forEach((d) => s.add(getLocalMidnight(d).getTime()));
    return s;
  }, [videoDates]);

  // Only enable days that have videos
  const disabledMatcher = (date: Date) =>
    !availableDays.has(getLocalMidnight(date).getTime());

  // Default month to show: selected date, or most recent video date
  const defaultMonth = selectedDate ?? videoDates[0];

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
          selected={selectedDate}
          onSelect={(day) => onChange(day ?? undefined)}
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
  isSorted,
  onClick,
}: {
  isSorted: false | "asc" | "desc";
  onClick: ((event: unknown) => void) | undefined;
}) {
  return (
    <button onClick={onClick} className="transition-colors hover:text-gray-600">
      {isSorted === "asc" ? (
        <ChevronUp className="h-3.5 w-3.5 text-primary" />
      ) : isSorted === "desc" ? (
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
  dateFilter: Date | undefined;
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
          {getDateLabel(dateFilter)}
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

export function VideoTable({ videos }: { videos: Video[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Multi-select filters managed outside TanStack (body, category)
  const [bodyFilter, setBodyFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [transcriptFilter, setTranscriptFilter] = useState(false);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: "status", value: "hide_scheduled" }, // Hide scheduled by default
  ]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "status", desc: false }, // Live first, then finished
    { id: "date", desc: true },
  ]);
  const [inputValue, setInputValue] = useState(searchParams.get("q") || "");
  const [globalFilter, setGlobalFilter] = useState(searchParams.get("q") || "");
  const [showScheduled, setShowScheduled] = useState(false);
  const [searchResults, setSearchResults] = useState<Video[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Sync inputs from URL (back/forward navigation)
  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    setInputValue(urlQuery);
    setGlobalFilter(urlQuery);
  }, [searchParams]);

  // Sync submitted query to URL
  useEffect(() => {
    const currentQuery = searchParams.get("q") || "";
    if (globalFilter !== currentQuery) {
      const params = new URLSearchParams(searchParams.toString());
      if (globalFilter) {
        params.set("q", globalFilter);
      } else {
        params.delete("q");
      }
      const newUrl = params.toString() ? `?${params.toString()}` : "/";
      router.replace(newUrl, { scroll: false });
    }
  }, [globalFilter, searchParams, router]);

  // Fetch search results when submitted query changes
  useEffect(() => {
    if (!globalFilter || globalFilter.length < 2) {
      setSearchResults(null);
      setSearchOffset(0);
      setHasMoreResults(false);
      return;
    }

    setIsSearching(true);
    setSearchOffset(0);
    fetch(`/api/search?q=${encodeURIComponent(globalFilter)}`)
      .then((res) => res.json())
      .then((data) => {
        setSearchResults(data.videos);
        setHasMoreResults(data.hasMore);
        setSearchOffset(data.videos.length);
      })
      .catch(() => setSearchResults(null))
      .finally(() => setIsSearching(false));
  }, [globalFilter]);

  const loadMore = () => {
    if (!globalFilter || isLoadingMore) return;
    setIsLoadingMore(true);
    fetch(
      `/api/search?q=${encodeURIComponent(globalFilter)}&offset=${searchOffset}`,
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
    setGlobalFilter(trimmed);
    if (!trimmed) setSearchResults(null);
  };

  const tableData = searchResults ?? videos;

  const uniqueBodies = useMemo(
    () =>
      Array.from(
        new Set(tableData.map((v) => v.body).filter(Boolean) as string[]),
      ).sort(),
    [tableData],
  );

  const uniqueCategories = useMemo(
    () =>
      Array.from(
        new Set(tableData.map((v) => v.category).filter(Boolean) as string[]),
      ).sort(),
    [tableData],
  );

  const videoDates = useMemo(() => {
    const dates: Date[] = [];
    tableData.forEach((v) => {
      const time = v.scheduledTime;
      if (!time) return;
      dates.push(parseUNTimestamp(time));
    });
    return dates;
  }, [tableData]);

  // Unique date options for mobile select
  const mobileDateOptions = useMemo(() => {
    const seen = new Map<number, string>();
    videoDates.forEach((d) => {
      const ts = getLocalMidnight(d).getTime();
      if (!seen.has(ts)) seen.set(ts, getDateLabel(d));
    });
    return Array.from(seen, ([timestamp, label]) => ({ timestamp, label }));
  }, [videoDates]);

  // Sync multi-select filters into TanStack column filters
  useEffect(() => {
    setColumnFilters((prev) => {
      const base = prev.filter(
        (f) => f.id !== "body" && f.id !== "category" && f.id !== "hasTranscript",
      );
      if (bodyFilter.length > 0) base.push({ id: "body", value: bodyFilter });
      if (categoryFilter.length > 0)
        base.push({ id: "category", value: categoryFilter });
      if (transcriptFilter) base.push({ id: "hasTranscript", value: true });
      return base;
    });
  }, [bodyFilter, categoryFilter, transcriptFilter]);

  const dateFilterValue = columnFilters.find((f) => f.id === "date")
    ?.value as Date | undefined;

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
        enableColumnFilter: true,
        sortingFn: (rowA, rowB) => {
          const timeA = rowA.original.scheduledTime;
          const timeB = rowB.original.scheduledTime;
          const dateA = timeA
            ? parseUNTimestamp(timeA)
            : new Date(rowA.original.date);
          const dateB = timeB
            ? parseUNTimestamp(timeB)
            : new Date(rowB.original.date);
          const dayA = getLocalMidnight(dateA).getTime();
          const dayB = getLocalMidnight(dateB).getTime();
          if (dayA !== dayB) return dayA - dayB;
          return dateA.getTime() - dateB.getTime();
        },
        filterFn: (row, _columnId, filterValue: Date) => {
          const time = row.original.scheduledTime;
          if (!time) return false;
          return (
            getLocalMidnight(parseUNTimestamp(time)).getTime() ===
            getLocalMidnight(filterValue).getTime()
          );
        },
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
        enableColumnFilter: false,
        enableSorting: false,
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
      columnHelper.accessor("status", {
        header: () => null,
        cell: () => null,
        size: 0,
        sortingFn: (rowA, rowB) => {
          const order = { live: 0, finished: 1, scheduled: 2 };
          return order[rowA.original.status] - order[rowB.original.status];
        },
        enableColumnFilter: true,
        filterFn: (row, _columnId, filterValue) => {
          if (filterValue === "hide_scheduled")
            return row.original.status !== "scheduled";
          if (filterValue === "show_only_scheduled")
            return row.original.status === "scheduled";
          return true;
        },
        enableHiding: true,
      }),
      columnHelper.accessor("cleanTitle", {
        header: "Title",
        cell: (info) => {
          const encodedId = encodeURIComponent(info.row.original.id);
          const isScheduled = info.row.original.status === "scheduled";
          const isLive = info.row.original.status === "live";
          const hasTranscript = info.row.original.hasTranscript;
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
              {info.getValue()}
            </a>
          );
        },
        size: 400,
        enableColumnFilter: true,
        filterFn: "includesString",
      }),
      columnHelper.accessor("body", {
        header: "Body",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
        size: 140,
        enableColumnFilter: true,
        filterFn: (row, _columnId, filterValue: string[]) => {
          const val = row.original.body;
          if (!val) return false;
          return filterValue.includes(val);
        },
      }),
      columnHelper.accessor("category", {
        header: "Category",
        cell: (info) => (
          <span className="text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
        size: 140,
        enableColumnFilter: true,
        filterFn: (row, _columnId, filterValue: string[]) => {
          const val = row.original.category;
          if (!val) return false;
          return filterValue.includes(val);
        },
      }),
      columnHelper.accessor("hasTranscript", {
        header: () => null,
        cell: () => null,
        size: 0,
        enableColumnFilter: true,
        filterFn: (row, _columnId, filterValue) => {
          if (filterValue === true) return row.original.hasTranscript === true;
          return true;
        },
        enableHiding: true,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      columnFilters,
      sorting,
      globalFilter: searchResults ? "" : globalFilter,
      columnVisibility: { status: false, hasTranscript: false },
    },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  // When search activates: show all results (no pagination). When cleared: restore pagination.
  useEffect(() => {
    if (searchResults) {
      table.setPageSize(1000);
    } else {
      table.setPageSize(50);
    }
    table.setPageIndex(0);
  }, [searchResults]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle between Past and Scheduled tabs
  const toggleScheduled = () => {
    const newValue = !showScheduled;
    setShowScheduled(newValue);
    if (newValue) {
      setColumnFilters((prev) => [
        ...prev.filter((f) => f.id !== "status"),
        { id: "status", value: "show_only_scheduled" },
      ]);
      setSorting([{ id: "date", desc: false }]);
    } else {
      setColumnFilters((prev) => [
        ...prev.filter((f) => f.id !== "status"),
        { id: "status", value: "hide_scheduled" },
      ]);
      setSorting([
        { id: "status", desc: false },
        { id: "date", desc: true },
      ]);
    }
  };

  const dateCol = table.getColumn("date");
  const titleCol = table.getColumn("cleanTitle");

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
            onClick={() => showScheduled && toggleScheduled()}
            className={`rounded-full px-4 py-1.5 transition-all ${!showScheduled ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Past
          </button>
          <button
            onClick={() => !showScheduled && toggleScheduled()}
            className={`rounded-full px-4 py-1.5 transition-all ${showScheduled ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Scheduled
          </button>
        </div>
        <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-medium shadow-xs">
          <button
            onClick={() => setTranscriptFilter(false)}
            className={`rounded-full px-4 py-1.5 transition-all ${!transcriptFilter ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          <button
            onClick={() => setTranscriptFilter(true)}
            className={`rounded-full px-4 py-1.5 transition-all ${transcriptFilter ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Transcribed
          </button>
        </div>
        <div className="ml-auto text-sm whitespace-nowrap text-muted-foreground">
          {isSearching
            ? "Searching…"
            : searchResults !== null
              ? hasMoreResults
                ? `Showing ${searchResults.length} meetings`
                : `${searchResults.length} meetings in total`
              : globalFilter ||
                  columnFilters.some(
                    (f) => f.id !== "status" && f.id !== "hasTranscript",
                  ) ||
                  bodyFilter.length > 0 ||
                  categoryFilter.length > 0
                ? `${table.getFilteredRowModel().rows.length} meetings`
                : null}
        </div>
      </div>

      {/* Active filter pills */}
      <ActiveFilters
        dateFilter={dateFilterValue}
        bodyFilter={bodyFilter}
        categoryFilter={categoryFilter}
        onClearDate={() =>
          setColumnFilters((prev) => prev.filter((f) => f.id !== "date"))
        }
        onClearBody={(v) => setBodyFilter((prev) => prev.filter((b) => b !== v))}
        onClearCategory={(v) =>
          setCategoryFilter((prev) => prev.filter((c) => c !== v))
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
            value={dateFilterValue ? getLocalMidnight(dateFilterValue).getTime().toString() : ""}
            onChange={(e) => {
              const val = e.target.value;
              setColumnFilters((prev) => {
                const base = prev.filter((f) => f.id !== "date");
                if (val) base.push({ id: "date", value: new Date(Number(val)) });
                return base;
              });
            }}
            className="min-w-[120px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Dates</option>
            {mobileDateOptions.map(({ label, timestamp }) => (
              <option key={timestamp} value={timestamp.toString()}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={bodyFilter[0] || ""}
            onChange={(e) =>
              setBodyFilter(e.target.value ? [e.target.value] : [])
            }
            className="min-w-[120px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Bodies</option>
            {uniqueBodies.map((body) => (
              <option key={body} value={body}>
                {body}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter[0] || ""}
            onChange={(e) =>
              setCategoryFilter(e.target.value ? [e.target.value] : [])
            }
            className="min-w-[120px] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map((cat) => (
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
              checked={transcriptFilter}
              onChange={(e) => setTranscriptFilter(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-primary"
            />
            <span className="text-muted-foreground">With transcript</span>
          </label>
          <div className="flex rounded-md bg-muted p-0.5 text-xs font-medium">
            <button
              onClick={() => showScheduled && toggleScheduled()}
              className={`rounded px-3 py-1.5 transition-colors ${!showScheduled ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Past
            </button>
            <button
              onClick={() => !showScheduled && toggleScheduled()}
              className={`rounded px-3 py-1.5 transition-colors ${showScheduled ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Scheduled
            </button>
          </div>
        </div>
      </div>

      {/* "Back to recent" banner */}
      {searchResults !== null && (
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
                      videoDates={videoDates}
                      selectedDate={dateFilterValue}
                      onChange={(val) =>
                        setColumnFilters((prev) => {
                          const base = prev.filter((f) => f.id !== "date");
                          if (val) base.push({ id: "date", value: val });
                          return base;
                        })
                      }
                    />
                    <SortArrow
                      isSorted={dateCol?.getIsSorted() || false}
                      onClick={dateCol?.getToggleSortingHandler()}
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
                      isSorted={titleCol?.getIsSorted() || false}
                      onClick={titleCol?.getToggleSortingHandler()}
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
                      options={uniqueBodies}
                      selected={bodyFilter}
                      onChange={setBodyFilter}
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
                      options={uniqueCategories}
                      selected={categoryFilter}
                      onChange={setCategoryFilter}
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

      {/* Load more */}
      {searchResults !== null && hasMoreResults && (
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

      {searchResults === null && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-0.5">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              ««
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              «
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              »
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-25"
            >
              »»
            </button>
          </div>

          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>

          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
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
