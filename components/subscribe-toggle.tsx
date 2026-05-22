"use client";

import { useState, useEffect } from "react";
import { Bell, BellRing } from "lucide-react";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

interface SubscribeToggleProps {
  kalturaId: string;
  language: string;
}

// "Email me when ready" toggle. Pure subscription — the parent only renders it
// while a transcript is already pending (queued/running), so there's always a
// notification that can resolve. Toggling off only unsubscribes; it never
// cancels a running job. Renders nothing for logged-out users.
export function SubscribeToggle({
  kalturaId,
  language,
}: SubscribeToggleProps) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/subscriptions?kalturaId=${encodeURIComponent(kalturaId)}&language=${encodeURIComponent(language)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLoggedIn(!!data.loggedIn);
        setSubscribed(!!data.subscribed);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [kalturaId, language]);

  if (loading || !loggedIn) return null;

  const toggle = async () => {
    setPending(true);
    const next = !subscribed;
    setSubscribed(next); // optimistic
    try {
      const res = await fetch("/api/subscriptions/video", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kalturaId, language }),
      });
      if (!res.ok) setSubscribed(!next); // revert
    } catch {
      setSubscribed(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={
        subscribed
          ? "You'll be emailed when this transcript is ready. Click to unsubscribe."
          : "Email me when this transcript is ready"
      }
      className={cn(
        typography.label,
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors disabled:opacity-50",
        subscribed
          ? "border-un-blue/40 bg-un-blue/10 text-un-blue"
          : "border-border hover:bg-muted",
      )}
    >
      {subscribed ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {subscribed ? "Subscribed" : "Email me when ready"}
    </button>
  );
}
