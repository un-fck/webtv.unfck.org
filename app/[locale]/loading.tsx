import { HomePageSkeleton } from "@/components/home-page-skeleton";

// Locale-level loading fallback. Fires during navigation transitions to
// /[locale], /[locale]/about, /[locale]/login, /[locale]/verify,
// /[locale]/subscriptions (anything under [locale] without its own
// loading.tsx). The meeting and speakers routes have route-specific
// loaders that match their shapes more precisely.
//
// Homepage is the highest-traffic landing this fires for, so the skeleton
// silhouette matches it. The static auth/about pages render too fast for
// this loader to be noticed.
export default function Loading() {
  return <HomePageSkeleton />;
}
