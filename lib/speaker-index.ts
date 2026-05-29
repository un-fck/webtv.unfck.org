import {
  getSpeakerMappingsWithMeta,
  getStatementDurationsForTranscripts,
  getStatementsForRefs,
  type SpeakerInfo,
  type SpeakerMappingWithMeta,
} from "@/lib/db";

/**
 * Statements shorter than this are dropped from the speaker directory entirely
 * — they're typically procedural one-liners ("I thank the representative…"),
 * and their video thumbnails almost never frame the speaker. Filtering at the
 * index level keeps entity/person/meeting counts and the feed in sync (DRY).
 */
const MIN_STATEMENT_DURATION_MS = 30_000;
import { getCountryName } from "@/lib/country-lookup";
import { meetingSlugFromVideo } from "@/lib/meeting-slug";
import { slugify } from "@/lib/speaker-keys";

export { slugify } from "@/lib/speaker-keys";

export type EntityKind = "country" | "group" | "org";

/** A single statement attributed to a speaker, with the meeting it came from. */
export interface SpeakerRef {
  transcriptId: string;
  entryId: string;
  statementIndex: number;
  meetingSlug: string;
  meetingTitle: string | null;
  date: string | null;
  language: string | null;
  name: string | null;
  function: string | null;
  affiliation: string | null;
  group: string | null;
}

export interface PersonSummary {
  /** Raw name string, or null for the synthetic "Unattributed" bucket. */
  name: string | null;
  statementCount: number;
  meetingCount: number;
}

export interface EntitySummary {
  /** Clean URL slug, e.g. "ocha", "china", "african-union". */
  slug: string;
  kind: EntityKind;
  label: string;
  /** ISO3 code when kind === "country". */
  code: string | null;
  statementCount: number;
  meetingCount: number;
  people: PersonSummary[];
}

interface EntityNode {
  key: string;
  kind: EntityKind;
  label: string;
  code: string | null;
  /** personName ("" = unattributed) → refs */
  people: Map<string, SpeakerRef[]>;
  meetings: Set<string>;
  statementCount: number;
}

export interface SpeakerIndex {
  entities: Map<string, EntityNode>;
}

const UNATTRIBUTED = "";

function isCountryCode(affiliation: string, countryNames: Map<string, string>) {
  return (
    affiliation.length === 3 &&
    affiliation === affiliation.toUpperCase() &&
    countryNames.has(affiliation)
  );
}

function getOrCreate(
  index: SpeakerIndex,
  key: string,
  kind: EntityKind,
  label: string,
  code: string | null,
): EntityNode {
  let node = index.entities.get(key);
  if (!node) {
    node = {
      key,
      kind,
      label,
      code,
      people: new Map(),
      meetings: new Set(),
      statementCount: 0,
    };
    index.entities.set(key, node);
  }
  return node;
}

function addRef(node: EntityNode, ref: SpeakerRef) {
  const personKey = ref.name ?? UNATTRIBUTED;
  const refs = node.people.get(personKey);
  if (refs) refs.push(ref);
  else node.people.set(personKey, [ref]);
  node.meetings.add(ref.transcriptId);
  node.statementCount += 1;
}

async function resolveCountryNames(
  rows: SpeakerMappingWithMeta[],
): Promise<Map<string, string>> {
  const codes = new Set<string>();
  for (const row of rows) {
    for (const info of Object.values(row.mapping)) {
      if (typeof info !== "object" || info === null) continue;
      const aff = (info as SpeakerInfo).affiliation;
      if (aff && aff.length === 3 && aff === aff.toUpperCase()) codes.add(aff);
    }
  }
  const names = new Map<string, string>();
  for (const code of codes) {
    const name = await getCountryName(code);
    if (name) names.set(code, name);
  }
  return names;
}

// In-process TTL memo for the raw rows. We can't use `unstable_cache` here:
// the mappings JSONB exceeds its 2MB per-entry limit, and it would also
// JSON-serialize away the `Map`s we build below. Rebuilding the index from
// these rows is cheap (tens of ms for ~37k entries), so we only memoize the DB
// fetch. Acceptable for an experimental, single-instance feature.
const ROWS_TTL_MS = 300_000;
interface CachedRows {
  rows: SpeakerMappingWithMeta[];
  /** transcriptId → (statementIndex → durationMs). Missing entries = unknown. */
  durations: Map<string, Map<number, number>>;
}
let rowsCache: { at: number; data: CachedRows } | null = null;
let rowsInflight: Promise<CachedRows> | null = null;

async function cachedRows(): Promise<CachedRows> {
  if (rowsCache && Date.now() - rowsCache.at < ROWS_TTL_MS) {
    return rowsCache.data;
  }
  if (!rowsInflight) {
    rowsInflight = (async () => {
      const rows = await getSpeakerMappingsWithMeta();
      const durations = await getStatementDurationsForTranscripts(
        rows.map((r) => r.transcript_id),
      );
      const data: CachedRows = { rows, durations };
      rowsCache = { at: Date.now(), data };
      return data;
    })().finally(() => {
      rowsInflight = null;
    });
  }
  return rowsInflight;
}

async function buildSpeakerIndexFromRows(): Promise<SpeakerIndex> {
  const { rows, durations } = await cachedRows();
  const countryNames = await resolveCountryNames(rows);
  const index: SpeakerIndex = { entities: new Map() };

  for (const row of rows) {
    const meetingSlug = meetingSlugFromVideo({
      pv_symbol: row.pv_symbol,
      part_number: row.part_number,
      asset_id: row.asset_id ?? row.entry_id,
    });

    const txDurations = durations.get(row.transcript_id);
    for (const [idxStr, value] of Object.entries(row.mapping)) {
      // Skip the 3 legacy string-format entries and any empty rows.
      if (typeof value !== "object" || value === null) continue;
      const info = value as SpeakerInfo;
      const statementIndex = Number(idxStr);
      if (!Number.isInteger(statementIndex)) continue;

      // Drop short statements at the source so every downstream count
      // (entity, person, meeting, feed) stays consistent. Unknown duration
      // (transcript content missing the statement) is also dropped.
      const durationMs = txDurations?.get(statementIndex);
      if (durationMs == null || durationMs < MIN_STATEMENT_DURATION_MS)
        continue;

      const ref: SpeakerRef = {
        transcriptId: row.transcript_id,
        entryId: row.entry_id,
        statementIndex,
        meetingSlug,
        meetingTitle: row.title,
        date: row.date,
        language: row.language_code,
        name: info.name ?? null,
        function: info.function ?? null,
        affiliation: info.affiliation ?? null,
        group: info.group ?? null,
      };

      const hasAffiliation = !!info.affiliation;
      const hasGroup = !!info.group;

      if (hasAffiliation) {
        const aff = info.affiliation as string;
        if (isCountryCode(aff, countryNames)) {
          addRef(
            getOrCreate(
              index,
              `country:${aff}`,
              "country",
              countryNames.get(aff) ?? aff,
              aff,
            ),
            ref,
          );
        } else {
          addRef(getOrCreate(index, `org:${aff}`, "org", aff, null), ref);
        }
      }
      if (hasGroup) {
        const grp = info.group as string;
        addRef(getOrCreate(index, `group:${grp}`, "group", grp, null), ref);
      }
      // Entries with neither affiliation nor group are intentionally dropped
      // from the directory (no entity to file them under).
    }
  }

  return index;
}

export async function buildSpeakerIndex(): Promise<SpeakerIndex> {
  return buildSpeakerIndexFromRows();
}

// ── Merge-by-slug layer ───────────────────────────────────────────────────
// Entity labels and person names are AI-extracted, so the same body/person
// shows up under casing/accent/punctuation variants ("INTERPOL"/"Interpol",
// "António"/"Antonio Guterres"). They share a slug, so we merge every entity —
// and every person within — that slugs the same into one logical profile. The
// canonical label/name shown is whichever variant has the most statements.

/** One person bucket inside a merged entity, keyed by `slugify(name)`. */
interface MergedPerson {
  /** Canonical display name (most-frequent variant), or null if unattributed. */
  name: string | null;
  refs: SpeakerRef[];
}

interface MergedEntity {
  slug: string;
  kind: EntityKind;
  label: string;
  code: string | null;
  /** personSlug ("" = unattributed) → bucket */
  people: Map<string, MergedPerson>;
  meetings: Set<string>;
  statementCount: number;
}

/** Pick the variant with the most refs (ties → first seen). */
function canonical<T>(counts: Map<T, number>): T {
  let best: T | undefined;
  let bestN = -1;
  for (const [value, n] of counts) {
    if (n > bestN) {
      best = value;
      bestN = n;
    }
  }
  return best as T;
}

async function buildMergedEntities(): Promise<Map<string, MergedEntity>> {
  const index = await buildSpeakerIndex();

  // Group raw nodes by entity slug, then collapse each group.
  const groups = new Map<string, EntityNode[]>();
  for (const node of index.entities.values()) {
    const slug = slugify(node.label);
    if (!slug) continue; // labels that slug to "" have no usable URL
    const list = groups.get(slug);
    if (list) list.push(node);
    else groups.set(slug, [node]);
  }

  const merged = new Map<string, MergedEntity>();
  for (const [slug, nodes] of groups) {
    // Canonical entity identity = highest-statement-count node.
    const head = nodes
      .slice()
      .sort((a, b) => b.statementCount - a.statementCount)[0];

    const people = new Map<
      string,
      { refs: SpeakerRef[]; nameCounts: Map<string, number> }
    >();
    const meetings = new Set<string>();
    let statementCount = 0;

    for (const node of nodes) {
      for (const [personKey, refs] of node.people) {
        const personSlug =
          personKey === UNATTRIBUTED ? UNATTRIBUTED : slugify(personKey);
        let bucket = people.get(personSlug);
        if (!bucket) {
          bucket = { refs: [], nameCounts: new Map() };
          people.set(personSlug, bucket);
        }
        bucket.refs.push(...refs);
        if (personKey !== UNATTRIBUTED) {
          bucket.nameCounts.set(
            personKey,
            (bucket.nameCounts.get(personKey) ?? 0) + refs.length,
          );
        }
        for (const ref of refs) meetings.add(ref.transcriptId);
        statementCount += refs.length;
      }
    }

    const mergedPeople = new Map<string, MergedPerson>();
    for (const [personSlug, bucket] of people) {
      mergedPeople.set(personSlug, {
        name: personSlug === UNATTRIBUTED ? null : canonical(bucket.nameCounts),
        refs: bucket.refs,
      });
    }

    merged.set(slug, {
      slug,
      kind: head.kind,
      label: head.label,
      code: head.code,
      people: mergedPeople,
      meetings,
      statementCount,
    });
  }

  return merged;
}

function summarizePeople(entity: MergedEntity): PersonSummary[] {
  const people: PersonSummary[] = [];
  for (const { name, refs } of entity.people.values()) {
    people.push({
      name,
      statementCount: refs.length,
      meetingCount: new Set(refs.map((r) => r.transcriptId)).size,
    });
  }
  return people.sort((a, b) => b.statementCount - a.statementCount);
}

/** Lightweight, serializable summaries for the overview page. */
export async function getEntitySummaries(): Promise<EntitySummary[]> {
  const merged = await buildMergedEntities();
  const out: EntitySummary[] = [];
  for (const entity of merged.values()) {
    out.push({
      slug: entity.slug,
      kind: entity.kind,
      label: entity.label,
      code: entity.code,
      statementCount: entity.statementCount,
      meetingCount: entity.meetings.size,
      people: summarizePeople(entity),
    });
  }
  return out.sort((a, b) => b.statementCount - a.statementCount);
}

export interface EntityProfile {
  slug: string;
  kind: EntityKind;
  label: string;
  code: string | null;
  /** Present when this is a single-person profile. */
  personName: string | null;
  refs: SpeakerRef[];
  people: PersonSummary[];
}

/**
 * Resolve a profile by entity slug, or a single person within it when
 * `personSlug` is supplied. Returns null if the entity (or person) is unknown.
 */
export async function getEntityProfileBySlug(
  entitySlug: string,
  personSlug?: string | null,
): Promise<EntityProfile | null> {
  const merged = await buildMergedEntities();
  const entity = merged.get(entitySlug);
  if (!entity) return null;

  let refs: SpeakerRef[];
  let personName: string | null = null;
  if (personSlug != null) {
    const bucket = entity.people.get(personSlug);
    if (!bucket || bucket.refs.length === 0) return null;
    refs = bucket.refs;
    personName = bucket.name;
  } else {
    refs = [...entity.people.values()].flatMap((p) => p.refs);
  }
  // Newest first. `date` is a JS Date.toString(), not lexically sortable, so
  // compare parsed timestamps; tie-break by statement order within a meeting.
  refs = refs.slice().sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return b.statementIndex - a.statementIndex;
  });

  return {
    slug: entity.slug,
    kind: entity.kind,
    label: entity.label,
    code: entity.code,
    personName,
    refs,
    people: summarizePeople(entity),
  };
}

/** How many statement "posts" we load per page on a profile feed. */
export const SPEAKER_PAGE_SIZE = 8;

/** A single statement rendered as a post in the profile feed. */
export interface ProfileBubble {
  transcriptId: string;
  entryId: string;
  statementIndex: number;
  startSeconds: number | null;
  meetingSlug: string;
  meetingTitle: string | null;
  date: string | null;
  language: string | null;
  name: string | null;
  function: string | null;
  affiliation: string | null;
  affiliationName: string | null;
  group: string | null;
  text: string;
}

/**
 * Turn a (already-sorted, already-sliced) set of refs into render-ready
 * bubbles: extracts each statement's text from the DB (cheap, per-statement)
 * and resolves ISO3 affiliations to country names. Shared by the profile page
 * and the pagination API so both produce identical posts.
 */
export async function refsToBubbles(
  refs: SpeakerRef[],
): Promise<ProfileBubble[]> {
  if (refs.length === 0) return [];

  const statements = await getStatementsForRefs(
    refs.map((r) => ({
      transcriptId: r.transcriptId,
      statementIndex: r.statementIndex,
    })),
  );

  const countryNames = new Map<string, string>();
  for (const code of new Set(
    refs
      .map((r) => r.affiliation)
      .filter(
        (a): a is string => !!a && a.length === 3 && a === a.toUpperCase(),
      ),
  )) {
    const name = await getCountryName(code);
    if (name) countryNames.set(code, name);
  }

  return refs.map((ref) => {
    const stmt = statements.get(`${ref.transcriptId}:${ref.statementIndex}`);
    return {
      transcriptId: ref.transcriptId,
      entryId: ref.entryId,
      statementIndex: ref.statementIndex,
      startSeconds: stmt?.start != null ? stmt.start / 1000 : null,
      meetingSlug: ref.meetingSlug,
      meetingTitle: ref.meetingTitle,
      date: ref.date,
      language: ref.language,
      name: ref.name,
      function: ref.function,
      affiliation: ref.affiliation,
      affiliationName: ref.affiliation
        ? (countryNames.get(ref.affiliation) ?? ref.affiliation)
        : null,
      group: ref.group,
      text: stmt?.text ?? "",
    };
  });
}
