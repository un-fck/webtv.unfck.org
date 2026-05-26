import Link from "next/link";
import type {
  EntityKind,
  PersonSummary,
  ProfileBubble,
} from "@/lib/speaker-index";
import { StatementFeed } from "@/components/statement-feed";
import { slugify } from "@/lib/speaker-keys";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<EntityKind, string> = {
  country: "Country",
  group: "Group / coalition",
  org: "UN organ / agency",
};

// Stable-ish avatar tint from the label, so each profile feels distinct.
const AVATAR_TINTS = [
  "bg-un-blue/15 text-un-blue",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function SpeakerProfile({
  entitySlug,
  personSlug,
  label,
  kind,
  personName,
  entityHref,
  people,
  totalStatements,
  meetingCount,
  initialBubbles,
  initialNextOffset,
  initialHasMore,
}: {
  entitySlug: string;
  personSlug: string | null;
  label: string;
  kind: EntityKind;
  personName: string | null;
  entityHref: string;
  people: PersonSummary[];
  totalStatements: number;
  meetingCount: number;
  initialBubbles: ProfileBubble[];
  initialNextOffset: number;
  initialHasMore: boolean;
}) {
  const displayName = personName ?? label;
  const namedPeople = people.filter((p) => p.name);

  return (
    <div className="mx-auto max-w-xl">
      {/* Twitter-style profile header */}
      <header className="flex flex-col items-center pt-2 pb-8 text-center">
        <div
          className={cn(
            "flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold",
            tintFor(displayName),
          )}
        >
          {initials(displayName)}
        </div>
        <h1 className={cn(typography.pageTitle, "mt-4")}>{displayName}</h1>
        <p className={cn(typography.meta, "mt-1")}>
          {personName ? (
            // For a person, show their actual affiliation — not the generic
            // entity kind, which describes the bucket, not the speaker.
            <Link href={entityHref} className="hover:underline">
              {label}
            </Link>
          ) : (
            KIND_LABEL[kind]
          )}
        </p>
        <p className={cn(typography.caption, "mt-3")}>
          <span className="font-semibold text-foreground">
            {totalStatements}
          </span>{" "}
          statements ·{" "}
          <span className="font-semibold text-foreground">{meetingCount}</span>{" "}
          meetings
          {!personName && namedPeople.length > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-foreground">
                {namedPeople.length}
              </span>{" "}
              people
            </>
          )}
        </p>
      </header>

      {!personName && namedPeople.length > 0 && (
        <section className="mb-8">
          <ul className="flex flex-wrap justify-center gap-2">
            {namedPeople.map((p) => (
              <li key={p.name}>
                <Link
                  href={`${entityHref}/${slugify(p.name as string)}`}
                  className={cn(
                    typography.label,
                    "inline-flex items-center rounded-full bg-muted px-3 py-1 hover:bg-muted/70",
                  )}
                >
                  {p.name}
                  <span className="ml-1.5 text-muted-foreground">
                    {p.statementCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StatementFeed
        slug={entitySlug}
        person={personSlug}
        initialBubbles={initialBubbles}
        initialNextOffset={initialNextOffset}
        initialHasMore={initialHasMore}
      />
    </div>
  );
}
