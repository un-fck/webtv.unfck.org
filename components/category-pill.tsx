"use client";

import { Link } from "@/i18n/navigation";
import {
  CATEGORY_DOT_CLASS,
  getCategoryColor,
} from "@/lib/category-colors";
import { cn } from "@/lib/utils";

interface BaseProps {
  category: string;
  label: string;
  active?: boolean;
  count?: number;
}

// Either click-handled (used inside the schedule for toggling filters) or
// link-rendered (used on the meeting page to navigate to the filtered home
// view). Mutually exclusive to keep the call sites honest about intent.
type CategoryPillProps =
  | (BaseProps & { onClick: () => void; href?: never })
  | (BaseProps & { href: string; onClick?: never });

const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors";

export function CategoryPill({
  category,
  label,
  active = false,
  count,
  onClick,
  href,
}: CategoryPillProps) {
  const color = getCategoryColor(category);
  const className = cn(
    PILL_CLASS,
    active
      ? "bg-primary text-white"
      : "bg-gray-100 text-gray-700 hover:bg-gray-200",
  );

  const content = (
    <>
      {label}
      {color && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", CATEGORY_DOT_CLASS[color])}
        />
      )}
      {count !== undefined && (
        <span className={cn("ml-0.5", active ? "opacity-75" : "opacity-50")}>
          {count}
        </span>
      )}
    </>
  );

  if (href !== undefined) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  );
}
