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
    <div className="pt-6 pb-6">
      <h1 className={cn(typography.pageTitle, "mb-1.5")}>{t("headline")}</h1>
      <p className={typography.lead}>
        {t("lead")}{" "}
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
