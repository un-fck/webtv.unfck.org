"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { UN_LANGUAGES } from "@/lib/languages";

// Languages users can subscribe a feed in. Same set as the per-video toggle
// (the 6 UN languages plus the original-audio "floor" track).
const FEED_SUB_LANGUAGES = UN_LANGUAGES;

interface FeedOption {
  key: string;
  label: string;
  description: string | null;
  subscribedLanguages: string[];
}

interface VideoSub {
  kaltura_id: string;
  language: string;
  title: string | null;
  slug: string | null;
  emailed_at: string | null;
}

function formatEmailedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SubscriptionsManager() {
  const [loading, setLoading] = useState(true);
  const [feeds, setFeeds] = useState<FeedOption[]>([]);
  const [videoSubs, setVideoSubs] = useState<VideoSub[]>([]);

  const load = useCallback(() => {
    fetch("/api/subscriptions")
      .then((r) => r.json())
      .then((data) => {
        setFeeds(data.feeds ?? []);
        setVideoSubs(data.videoSubscriptions ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleFeed = async (key: string, language: string, next: boolean) => {
    const apply = (langs: string[]) =>
      next
        ? langs.includes(language)
          ? langs
          : [...langs, language]
        : langs.filter((l) => l !== language);
    setFeeds((prev) =>
      prev.map((f) =>
        f.key === key
          ? { ...f, subscribedLanguages: apply(f.subscribedLanguages) }
          : f,
      ),
    );
    try {
      const res = await fetch("/api/subscriptions/feed", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedKey: key, language }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert optimistic update.
      setFeeds((prev) =>
        prev.map((f) =>
          f.key === key
            ? {
                ...f,
                subscribedLanguages: next
                  ? f.subscribedLanguages.filter((l) => l !== language)
                  : [...f.subscribedLanguages, language],
              }
            : f,
        ),
      );
    }
  };

  const removeVideo = async (sub: VideoSub) => {
    setVideoSubs((prev) =>
      prev.filter(
        (s) =>
          !(s.kaltura_id === sub.kaltura_id && s.language === sub.language),
      ),
    );
    try {
      await fetch("/api/subscriptions/video", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kalturaId: sub.kaltura_id,
          language: sub.language,
        }),
      });
    } catch {
      load(); // re-sync on failure
    }
  };

  if (loading) {
    return (
      <p className={cn(typography.body, "text-muted-foreground")}>Loading…</p>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className={cn(typography.sectionTitle, "mb-1")}>Feeds</h2>
        <p className={cn(typography.caption, "mb-4 text-muted-foreground")}>
          Subscribe to a feed to be emailed whenever a matching meeting is
          transcribed.
        </p>
        <div className="divide-y divide-border rounded-lg border border-border">
          {feeds.length === 0 && (
            <p
              className={cn(typography.body, "px-4 py-6 text-muted-foreground")}
            >
              No feeds available.
            </p>
          )}
          {feeds.map((feed) => (
            <div
              key={feed.key}
              className="flex flex-wrap items-start justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className={typography.body}>{feed.label}</p>
                {feed.description && (
                  <p
                    className={cn(typography.caption, "text-muted-foreground")}
                  >
                    {feed.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {FEED_SUB_LANGUAGES.map((lang) => {
                  const active = feed.subscribedLanguages.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleFeed(feed.key, lang.code, !active)}
                      aria-pressed={active}
                      title={`${active ? "Unsubscribe" : "Subscribe"} — ${lang.name}`}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs uppercase transition-colors",
                        active
                          ? "border-un-blue bg-un-blue text-white"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {lang.code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className={cn(typography.sectionTitle, "mb-1")}>
          Followed meetings
        </h2>
        <p className={cn(typography.caption, "mb-4 text-muted-foreground")}>
          Individual meetings you asked to be emailed about.
        </p>
        {videoSubs.length === 0 ? (
          <p className={cn(typography.body, "text-muted-foreground")}>
            You aren&apos;t following any individual meetings. Use{" "}
            <span className="inline-flex items-center gap-1">
              <Bell className="h-3.5 w-3.5" /> Email me when ready
            </span>{" "}
            on a meeting page.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {videoSubs.map((sub) => (
              <li
                key={`${sub.kaltura_id}-${sub.language}`}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  {sub.slug ? (
                    <Link
                      href={`/${sub.slug}`}
                      className={cn(typography.body, "hover:text-un-blue")}
                    >
                      {sub.title || sub.slug}
                    </Link>
                  ) : (
                    <span className={typography.body}>
                      {sub.title || sub.kaltura_id}
                    </span>
                  )}
                  <p
                    className={cn(typography.caption, "text-muted-foreground")}
                  >
                    {sub.emailed_at ? (
                      <span className="text-un-blue">
                        Emailed {formatEmailedAt(sub.emailed_at)}
                      </span>
                    ) : (
                      "We'll email you when the transcript is ready"
                    )}
                  </p>
                </div>
                <button
                  onClick={() => removeVideo(sub)}
                  className={cn(
                    typography.caption,
                    "shrink-0 text-muted-foreground transition-colors hover:text-foreground",
                  )}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
