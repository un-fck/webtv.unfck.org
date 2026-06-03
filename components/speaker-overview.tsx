"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import type { EntityKind, EntitySummary } from "@/lib/speaker-index";
import { slugify } from "@/lib/speaker-keys";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const SECTION_KINDS: EntityKind[] = ["country", "group", "org"];
const SECTION_TITLE_KEY: Record<EntityKind, "countries" | "groups" | "organs"> = {
  country: "countries",
  group: "groups",
  org: "organs",
};

function profileHref(slug: string, name?: string | null) {
  const base = `/speakers/${slug}`;
  return name ? `${base}/${slugify(name)}` : base;
}

const MIN_STATEMENTS = 10;

function EntityRow({
  entity,
  searching,
  query,
}: {
  entity: EntitySummary;
  searching: boolean;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("speakerOverview");

  const labelMatches =
    searching && entity.label.toLowerCase().includes(query);
  // Person-match-only: search hit persons inside this org but not the org name
  // itself. Auto-expand and filter the list down to the matching persons.
  const personMatchOnly = searching && !labelMatches;

  const allNamedPeople = entity.people.filter((p) => p.name);
  const visibleNamedPeople = personMatchOnly
    ? allNamedPeople.filter((p) => p.name!.toLowerCase().includes(query))
    : allNamedPeople.filter(
        (p) => searching || p.statementCount >= MIN_STATEMENTS,
      );
  const unattributed = entity.people.find((p) => !p.name);

  const effectiveOpen = open || personMatchOnly;

  return (
    <li className="border-b border-border/60 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={effectiveOpen}
          aria-label={effectiveOpen ? t("collapse") : t("expand")}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform",
              effectiveOpen && "rotate-90",
            )}
          />
        </button>
        <Link
          href={profileHref(entity.slug)}
          className="font-medium text-foreground hover:text-un-blue hover:underline"
        >
          {entity.label}
        </Link>
        <span className={cn(typography.caption)}>{entity.statementCount}</span>
      </div>

      {effectiveOpen && (
        <ul className="mt-1 ml-7 space-y-0.5">
          {personMatchOnly && (
            <li className={cn(typography.caption, "mb-1")}>
              {t("membersFraction", {
                visible: visibleNamedPeople.length,
                total: allNamedPeople.length,
              })}
            </li>
          )}
          {visibleNamedPeople.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <Link
                href={profileHref(entity.slug, p.name)}
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
          {!personMatchOnly && unattributed && (
            <li className={cn(typography.caption, "italic")}>
              {t("unattributedStatements", {
                count: unattributed.statementCount,
              })}
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function SpeakerOverview({ entities }: { entities: EntitySummary[] }) {
  const [filter, setFilter] = useState("");
  const t = useTranslations("speakerOverview");

  const query = filter.trim().toLowerCase();
  const searching = query !== "";

  const filtered = useMemo(() => {
    if (!query) {
      // Default view: hide low-volume entities, but never hide countries.
      return entities.filter(
        (e) => e.kind === "country" || e.statementCount >= MIN_STATEMENTS,
      );
    }
    return entities.filter(
      (e) =>
        e.label.toLowerCase().includes(query) ||
        e.people.some((p) => p.name?.toLowerCase().includes(query)),
    );
  }, [entities, query]);

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
        placeholder={t("filterPlaceholder")}
        aria-label={t("filterPlaceholder")}
        className={cn(
          typography.body,
          "mb-8 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-un-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      />

      <div className="grid gap-10 lg:grid-cols-3">
        {SECTION_KINDS.map((kind) => {
          const list = byKind.get(kind) ?? [];
          return (
            <section key={kind}>
              <h2 className={cn(typography.sectionTitle, "mb-3")}>
                {t(SECTION_TITLE_KEY[kind])}{" "}
                <span className={typography.caption}>({list.length})</span>
              </h2>
              {list.length === 0 ? (
                <p className={cn(typography.caption)}>{t("noMatches")}</p>
              ) : (
                <ul>
                  {list.map((e) => (
                    <EntityRow
                      key={e.slug}
                      entity={e}
                      searching={searching}
                      query={query}
                    />
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
