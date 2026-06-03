"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTimezone } from "@/lib/hooks/use-timezone";
import { getTimezoneOptions } from "@/lib/timezone";
import { headerPillClass } from "@/lib/header-pill";
import { cn } from "@/lib/utils";

// Drop the "(EST)"-style parenthetical from a timezone label so the pill stays
// tight. The full label (with abbreviation) remains in the popover, which has
// room to spare.
function shortenTzLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function TimezonePicker() {
  const { timezone, setTimezone } = useTimezone();
  // Options depend on the browser timezone, which differs between the SSR
  // environment and the client. Defer to a post-mount render to avoid a
  // hydration mismatch (the server has no meaningful browser timezone).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = useMemo(() => getTimezoneOptions(), []);
  const t = useTranslations("header");

  if (!mounted || options.length <= 1) return null;

  // The pill shows the currently active option's short label (just the city —
  // e.g. "New York" or "Berlin"); the popover keeps the full "<City> (<abbr>)"
  // form since it's the disambiguator when two cities share a name.
  const active = options.find((o) => o.value === timezone) ?? options[0];

  return (
    <Popover>
      <PopoverTrigger aria-label={t("timezone")} className={headerPillClass}>
        <span>{shortenTzLabel(active.label)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <ul className="flex flex-col">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => setTimezone(opt.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                  opt.value === timezone
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <span>{opt.label}</span>
                {opt.value === timezone && (
                  <span className="ml-2 text-xs text-un-blue-text">●</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
