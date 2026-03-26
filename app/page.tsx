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
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <SiteHeader />

        <div className="py-6">
          <Suspense fallback={<div>Loading...</div>}>
            <VideoTable videos={videos} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
