"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

interface ExperimentalWaitlistButtonProps {
  initialOnWaitlist: boolean;
}

// Join/leave toggle for the experimental-features wait list on the About
// page. Only rendered for logged-in users without experimental access; the
// server page passes the initial membership state so there's no client
// fetch on mount. Updates optimistically and reverts on failure.
export function ExperimentalWaitlistButton({
  initialOnWaitlist,
}: ExperimentalWaitlistButtonProps) {
  const [onWaitlist, setOnWaitlist] = useState(initialOnWaitlist);
  const [pending, setPending] = useState(false);
  const t = useTranslations("about.experimental");

  const setMembership = async (next: boolean) => {
    setPending(true);
    setOnWaitlist(next); // optimistic
    try {
      const res = await fetch("/api/waitlist", {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) setOnWaitlist(!next); // revert
    } catch {
      setOnWaitlist(!next);
    } finally {
      setPending(false);
    }
  };

  if (onWaitlist) {
    return (
      <div className="flex items-center gap-3">
        <span
          className={cn(
            typography.body,
            "flex items-center gap-1.5 text-un-blue-text",
          )}
        >
          <Check className="h-4 w-4" aria-hidden />
          {t("onList")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setMembership(false)}
          className="text-muted-foreground"
        >
          {t("leave")}
        </Button>
      </div>
    );
  }

  return (
    <Button disabled={pending} onClick={() => setMembership(true)}>
      {t("joinButton")}
    </Button>
  );
}
