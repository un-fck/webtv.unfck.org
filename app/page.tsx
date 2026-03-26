import { Suspense } from "react";
import { getScheduleVideos } from "@/lib/un-api";
import { VideoTable } from "@/components/video-table";
import { SiteHeader } from "@/components/site-header";
import { scheduleLookbackDays } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const videos = await getScheduleVideos(scheduleLookbackDays);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-350 px-4 sm:px-6">
        <div className="py-6 pb-24">
          <Suspense fallback={<div>Loading...</div>}>
            <VideoTable videos={videos} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
