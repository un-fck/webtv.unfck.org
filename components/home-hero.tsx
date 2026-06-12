import { useTranslations } from "next-intl";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

/**
 * Homepage hero / explainer. Always rendered above the schedule table so the
 * site's purpose stays visible regardless of any active search or filters.
 * The "Learn more" link lives with the disclaimer note in the filter toolbar
 * (see transcript-table.tsx), not here.
 */
export function HomeHero() {
  const t = useTranslations("home");
  return (
    <div className="pt-8 pb-6">
      <h1 className={cn(typography.pageTitle, "mb-2")}>{t("headline")}</h1>
      <p className={typography.lead}>{t("lead")}</p>
    </div>
  );
}
