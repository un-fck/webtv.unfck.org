"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ProfileBubble } from "@/lib/speaker-index";
import { VideoMoment } from "@/components/video-moment";
import { useMeetingFormat } from "@/lib/hooks/use-meeting-format";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

const PREVIEW_SENTENCES = 3;

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("statementFeed");
  if (!text) {
    return <span className="text-muted-foreground italic">{t("noText")}</span>;
  }
  const sentences = text.split(/(?<=[.!?])\s+/);
  const truncated = sentences.length > PREVIEW_SENTENCES;
  const shown =
    expanded || !truncated
      ? text
      : sentences.slice(0, PREVIEW_SENTENCES).join(" ");

  return (
    <p className={cn(typography.body, "text-foreground")}>
      {shown}
      {truncated && (
        <>
          {!expanded && <span className="text-muted-foreground"> … </span>}{" "}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-medium text-un-blue-text hover:underline"
          >
            {expanded ? t("showLess") : t("showMore")}
          </button>
        </>
      )}
    </p>
  );
}

function SpeakerBadges({ bubble }: { bubble: ProfileBubble }) {
  if (!bubble.affiliationName && !bubble.group && !bubble.function) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {bubble.affiliationName && (
        <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          {bubble.affiliationName}
        </span>
      )}
      {bubble.group && (
        <span className="inline-flex items-center rounded-md bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
          {bubble.group}
        </span>
      )}
      {bubble.function &&
        bubble.function.toLowerCase() !== "representative" && (
          <span className="text-sm font-medium text-muted-foreground">
            {bubble.function}
          </span>
        )}
    </div>
  );
}

function StatementCard({ bubble }: { bubble: ProfileBubble }) {
  const t = useTranslations("statementFeed");
  const { formatMeetingDate } = useMeetingFormat();
  const dateLabel = bubble.date
    ? formatMeetingDate(bubble.date, { weekday: "none" })
    : "";
  return (
    <li className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-2">
        <SpeakerBadges bubble={bubble} />
      </div>

      {bubble.startSeconds != null && bubble.entryId && (
        <div className="mb-3">
          <VideoMoment
            entryId={bubble.entryId}
            startSeconds={bubble.startSeconds}
          />
        </div>
      )}

      <ExpandableText text={bubble.text} />

      <div
        className={cn(
          typography.caption,
          "mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-2",
        )}
      >
        <span>{dateLabel}</span>
        <Link
          href={`/${bubble.meetingSlug}`}
          className="hover:text-un-blue-text hover:underline"
        >
          {bubble.meetingTitle || t("viewTranscript")} →
        </Link>
      </div>
    </li>
  );
}

export function StatementFeed({
  slug,
  person,
  initialBubbles,
  initialNextOffset,
  initialHasMore,
}: {
  slug: string;
  person: string | null;
  initialBubbles: ProfileBubble[];
  initialNextOffset: number;
  initialHasMore: boolean;
}) {
  const [bubbles, setBubbles] = useState(initialBubbles);
  const [offset, setOffset] = useState(initialNextOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("statementFeed");
  const locale = useLocale();

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        slug,
        offset: String(offset),
        locale,
      });
      if (person) params.set("person", person);
      const res = await fetch(`/api/speakers/statements?${params.toString()}`);
      if (!res.ok) {
        setHasMore(false);
        return;
      }
      const data = (await res.json()) as {
        bubbles: ProfileBubble[];
        nextOffset: number;
        hasMore: boolean;
      };
      setBubbles((prev) => [...prev, ...data.bubbles]);
      setOffset(data.nextOffset);
      setHasMore(data.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, slug, person, offset, locale]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <>
      <ul className="space-y-5">
        {bubbles.map((b) => (
          <StatementCard
            key={`${b.transcriptId}-${b.statementIndex}`}
            bubble={b}
          />
        ))}
      </ul>

      {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}

      {loading && (
        <p className={cn(typography.caption, "mt-6 text-center")}>
          {t("loading")}
        </p>
      )}
      {!hasMore && bubbles.length > 0 && (
        <p className={cn(typography.caption, "mt-6 text-center")}>
          {t("endOfStatements")}
        </p>
      )}
    </>
  );
}
