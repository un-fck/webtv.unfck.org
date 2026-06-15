// URL ↔ filter-state mapping for the home schedule. Shared by the server
// page (parsing the request's searchParams) and the client table (parsing
// window.location to compare against the rendered server state), so both
// sides apply identical normalization rules — a URL the server would parse
// to X must parse to X on the client too, or the drift check below would
// report phantom mismatches.

export interface ServerParams {
  page: number;
  pageSize: number;
  sort?: string; // undefined = default date desc (browse and search both)
  date?: string;
  body?: string[];
  category?: string[];
  text?: string[]; // "transcript" | "pv" | "sr"
  q?: string;
  // "Include meetings in other languages" toggle, default off. When off and
  // the active locale is non-English, the schedule hides meetings without a
  // harvested i18n entry for that locale.
  includeOtherLangs?: boolean;
  // Schedule view mode: undefined / "recent" (default) shows today + past in
  // descending order; "upcoming" shows strictly future days in ascending
  // order. Ignored in search mode.
  view?: "upcoming";
  // Default-browse window expansion. The home page in its unfiltered state
  // loads `[today − 7w, today + 7w]` so the initial render reliably covers a
  // full week each way regardless of how dense the schedule is. The "Load
  // more" button increments this; undefined = 1 (the initial week).
  weeks?: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseScheduleParams(raw: RawSearchParams): ServerParams {
  const page = Math.max(1, parseInt(String(raw.page ?? "1"), 10) || 1);
  const pageSize = [25, 50, 100, 200].includes(Number(raw.pageSize))
    ? Number(raw.pageSize)
    : 50;
  const sort = ["date_desc", "date_asc", "title_asc", "title_desc"].includes(
    String(raw.sort ?? ""),
  )
    ? String(raw.sort)
    : undefined; // auto: date desc (default for browse and search)
  const date =
    typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : undefined;
  const body = Array.isArray(raw.body)
    ? raw.body.filter(Boolean)
    : typeof raw.body === "string" && raw.body
      ? [raw.body]
      : undefined;
  const category = Array.isArray(raw.category)
    ? raw.category.filter(Boolean)
    : typeof raw.category === "string" && raw.category
      ? [raw.category]
      : undefined;
  const textRaw = Array.isArray(raw.text)
    ? raw.text
    : typeof raw.text === "string" && raw.text
      ? [raw.text]
      : [];
  const text = textRaw.filter((d) => ["transcript", "pv", "sr"].includes(d));
  const q =
    typeof raw.q === "string" && raw.q.trim().length >= 2
      ? raw.q.trim()
      : undefined;
  const includeOtherLangs = raw.xlang === "1";
  const view = raw.view === "upcoming" ? "upcoming" : undefined;
  // Upper bound mirrors MAX_WEEKS in components/transcript-table.tsx — half a
  // year each side is the practical limit of the default-browse window before
  // search / the date picker become better tools.
  const weeksNum = Number(raw.weeks);
  const weeks =
    Number.isInteger(weeksNum) && weeksNum >= 2 && weeksNum <= 26
      ? weeksNum
      : undefined;

  return {
    page,
    pageSize,
    sort,
    date,
    body: body?.length ? body : undefined,
    category: category?.length ? category : undefined,
    text: text.length ? text : undefined,
    q,
    includeOtherLangs,
    view,
    weeks,
  };
}

// URLSearchParams → the Record shape Next.js hands server components, so the
// client can run the exact same parser over window.location.search.
export function rawFromSearchParams(sp: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return raw;
}

// Stable identity for a parsed param set, used to detect drift between the
// live URL and the server-rendered props. Multi-value order is irrelevant to
// the underlying query (IN-list predicates), so it's irrelevant here too.
export function scheduleParamsKey(p: ServerParams): string {
  const sorted = (a?: string[]) => (a && a.length ? [...a].sort() : undefined);
  return JSON.stringify({
    page: p.page,
    pageSize: p.pageSize,
    sort: p.sort,
    date: p.date,
    body: sorted(p.body),
    category: sorted(p.category),
    text: sorted(p.text),
    q: p.q,
    xlang: p.includeOtherLangs === true,
    view: p.view,
    weeks: p.weeks,
  });
}
