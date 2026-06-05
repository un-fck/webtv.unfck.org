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

// Drop the "(EDT)"-style parenthetical so the pill stays tight. The full
// "<City> (<abbr>)" form remains in the popover, where the abbreviation
// disambiguates between options. The popover's "Timezone" header carries the
// semantic context, so the pill itself doesn't need the abbreviation to read
// as a timezone (rather than a place filter).
function tzPillLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Compact (mobile) variant: keep only the parenthetical abbreviation
// ("EDT", "CET") since it's narrow and self-describing. Falls back to the
// city name when no abbreviation is present.
function tzCompactLabel(label: string): string {
  const m = label.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : label;
}

export function TimezonePicker({ compact = false }: { compact?: boolean }) {
  const { timezone, setTimezone } = useTimezone();
  // Options depend on the browser timezone, which differs between the SSR
  // environment and the client. Defer to a post-mount render to avoid a
  // hydration mismatch (the server has no meaningful browser timezone).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const options = useMemo(() => getTimezoneOptions(), []);
  const t = useTranslations("header");

  if (!mounted || options.length <= 1) return null;

  // Pill shows just the active city (e.g. "New York", "Berlin"); the popover
  // keeps the full "<City> (<abbr>)" form for disambiguation, plus a
  // "Timezone" header so the city name reads as a timezone choice.
  const active = options.find((o) => o.value === timezone) ?? options[0];

  return (
    <Popover>
      <PopoverTrigger aria-label={t("timezone")} className={headerPillClass}>
        {compact ? (
          <span>{tzCompactLabel(active.label)}</span>
        ) : (
          <>
            <span>{tzPillLabel(active.label)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
          {t("timezone")}
        </p>
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
