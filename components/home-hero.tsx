import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { typography } from "@/lib/typography";
import { cn } from "@/lib/utils";

/**
 * Homepage hero / explainer. Always rendered above the schedule table so the
 * site's purpose stays visible regardless of any active search or filters.
 */
export function HomeHero() {
  const t = useTranslations("home");
  return (
    <div className="max-w-2xl pt-4 pb-8">
      <span className="mb-3 inline-block rounded bg-un-blue/10 px-2 py-1 text-[11px] leading-none font-bold tracking-wide text-un-blue uppercase">
        {t("publicPreview")}
      </span>
      <h1 className={cn(typography.pageTitle, "mb-3")}>{t("headline")}</h1>
      <p className={cn(typography.lead, "text-balance")}>{t("lead")}</p>
      <p className={cn(typography.meta, "mt-3")}>{t("notice")}</p>
      <p className={cn(typography.meta, "mt-1")}>
        <Link
          href="/about"
          className="text-un-blue underline underline-offset-4 hover:opacity-75"
        >
          {t("learnMore")}
        </Link>
      </p>
    </div>
  );
}
