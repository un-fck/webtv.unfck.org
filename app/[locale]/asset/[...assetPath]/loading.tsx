import { MeetingPageSkeleton } from "@/components/meeting-page-skeleton";

// The asset/{id} route renders a meeting page, just keyed on the Web TV
// permalink instead of a citation slug. Without this file, Next would fall
// back to app/[locale]/loading.tsx — a generic spinner — for stage 1 of
// the load. Reuse the same shape as the citation route's skeleton.
export default function Loading() {
  return <MeetingPageSkeleton />;
}
