"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { ExternalLink } from "./external-link";
import type { VideoMetadata } from "@/lib/un-api";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

/**
 * The descriptive half of a WebTV asset's metadata: the long-form description
 * and any related sites and documents.
 *
 * The text is scraped from the English WebTV asset page regardless of the
 * request locale (see getVideoMetadata), so the headings translate but the
 * content stays English.
 */
export function VideoMetadataDetails({
  metadata,
}: {
  metadata: VideoMetadata;
}) {
  const t = useTranslations("video.metadata");
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  // Only measure while collapsed — once expanded the element no longer
  // overflows, and re-measuring would hide the "show less" control.
  useEffect(() => {
    if (expanded) return;
    const el = descriptionRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [metadata.description, expanded]);

  const hasDescription = Boolean(metadata.description);
  const hasRelatedDocuments = metadata.relatedDocuments.length > 0;
  if (!hasDescription && !hasRelatedDocuments) return null;

  return (
    <>
      {hasDescription && (
        <section className="mt-4">
          <h2 className={cn(typography.label, "text-muted-foreground")}>
            {t("description")}
          </h2>
          <p
            ref={descriptionRef}
            className={cn(
              "mt-1 whitespace-pre-line",
              typography.body,
              "text-muted-foreground",
              !expanded && "line-clamp-3",
            )}
          >
            {metadata.description}
          </p>
          {(overflowing || expanded) && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {expanded ? t("showLess") : t("showMore")}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
          )}
        </section>
      )}

      {hasRelatedDocuments && (
        <section className="mt-4">
          <h2 className={cn(typography.label, "text-muted-foreground")}>
            {t("relatedDocuments")}
          </h2>
          <ul className="mt-1 space-y-0.5">
            {metadata.relatedDocuments.map((document) => (
              <li key={document.url} className="text-sm">
                <ExternalLink
                  href={document.url}
                  className="text-primary hover:underline"
                >
                  {document.title}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
