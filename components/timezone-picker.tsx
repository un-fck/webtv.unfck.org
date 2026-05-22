"use client";

import { useTimezone } from "@/lib/hooks/use-timezone";
import { getTimezoneOptions } from "@/lib/timezone";
import { useMemo } from "react";
import { Globe } from "lucide-react";

export function TimezonePicker() {
  const { timezone, setTimezone } = useTimezone();
  const options = useMemo(() => getTimezoneOptions(), []);

  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Globe className="h-3.5 w-3.5 shrink-0" />
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        aria-label="Timezone"
        className="cursor-pointer appearance-none border-none bg-transparent pr-4 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0 center",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
