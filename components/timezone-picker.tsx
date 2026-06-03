"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTimezone } from "@/lib/hooks/use-timezone";
import { getTimezoneOptions } from "@/lib/timezone";
import { cn } from "@/lib/utils";

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

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("timezone")}
        className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Globe className="h-4 w-4" />
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
