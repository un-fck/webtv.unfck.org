"use client";

import { useTranslations } from "next-intl";
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface ExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

/**
 * Anchor that opens in a new tab and announces that fact to assistive tech via
 * a visually-hidden suffix. Use anywhere a link leaves the app (UN Web TV, PV
 * PDF, partner sites, etc.) — visual text stays unchanged.
 */
export function ExternalLink({ children, ...rest }: ExternalLinkProps) {
  const t = useTranslations("header");
  return (
    <a target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
      <span className="sr-only"> ({t("opensInNewTab")})</span>
    </a>
  );
}
