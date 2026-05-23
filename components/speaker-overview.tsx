"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { EntityKind, EntitySummary } from "@/lib/speaker-index";
import { encodeEntityKey } from "@/lib/speaker-keys";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const SECTIONS: { kind: EntityKind; title: string }[] = [
  { kind: "country", title: "Countries" },
  { kind: "group", title: "Groups & coalitions" },
  { kind: "org", title: "UN organs & agencies" },
];

function profileHref(key: string, name?: string | null) {
  const base = `/speakers/${encodeEntityKey(key)}`;
  return name ? `${base}/${encodeURIComponent(name)}` : base;
}

const MIN_STATEMENTS = 10;

function EntityRow({
  entity,
  searching,
}: {
  entity: EntitySummary;
  searching: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Hide low-volume people unless the user is searching (still discoverable).
  const namedPeople = entity.people.filter(
    (p) => p.name && (searching || p.statementCount >= MIN_STATEMENTS),
  );
  const unattributed = entity.people.find((p) => !p.name);

  return (
    <li className="border-b border-border/60 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
          />
        </button>
        <Link
          href={profileHref(entity.key)}
          className="font-medium text-foreground hover:text-un-blue hover:underline"
        >
          {entity.label}
        </Link>
        <span className={cn(typography.caption)}>{entity.statementCount}</span>
      </div>

      {open && (
        <ul className="mt-1 ml-7 space-y-0.5">
          {namedPeople.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <Link
                href={profileHref(entity.key, p.name)}
                className={cn(
                  typography.body,
                  "hover:text-un-blue hover:underline",
                )}
              >
                {p.name}
              </Link>
              <span className={typography.caption}>{p.statementCount}</span>
            </li>
          ))}
          {unattributed && (
            <li className={cn(typography.caption, "italic")}>
              + {unattributed.statementCount} unattributed statements
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function SpeakerOverview({ entities }: { entities: EntitySummary[] }) {
  const [filter, setFilter] = useState("");

  const searching = filter.trim() !== "";

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      // Default view: hide low-volume entities, but never hide countries.
      return entities.filter(
        (e) => e.kind === "country" || e.statementCount >= MIN_STATEMENTS,
      );
    }
    return entities.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.people.some((p) => p.name?.toLowerCase().includes(q)),
    );
  }, [entities, filter]);

  const byKind = useMemo(() => {
    const map = new Map<EntityKind, EntitySummary[]>();
    for (const e of filtered) {
      const list = map.get(e.kind);
      if (list) list.push(e);
      else map.set(e.kind, [e]);
    }
    return map;
  }, [filtered]);

  return (
    <div>
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by country, group, organ, or person…"
        className={cn(
          typography.body,
          "mb-8 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-un-blue",
        )}
      />

      <div className="grid gap-10 lg:grid-cols-3">
        {SECTIONS.map(({ kind, title }) => {
          const list = byKind.get(kind) ?? [];
          return (
            <section key={kind}>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                {title}{" "}
                <span className={typography.caption}>({list.length})</span>
              </h2>
              {list.length === 0 ? (
                <p className={cn(typography.caption)}>No matches.</p>
              ) : (
                <ul>
                  {list.map((e) => (
                    <EntityRow key={e.key} entity={e} searching={searching} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
