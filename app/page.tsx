import { Suspense } from "react";
import { getScheduleVideos } from "@/lib/un-api";
import { VideoTable } from "@/components/video-table";
import Image from "next/image";
import { scheduleLookbackDays } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const videos = await getScheduleVideos(scheduleLookbackDays);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <header className="flex items-center gap-4 border-b border-border py-5">
          <div className="h-9 w-1 shrink-0 rounded-full bg-un-blue" />
          <Image
            src="/images/un-logo-stacked-colour-english.svg"
            alt="United Nations"
            width={402}
            height={127}
            className="h-8 w-auto shrink-0"
          />
          <div className="h-8 w-px shrink-0 bg-border" />
          <div>
            <h1 className="text-lg leading-tight font-bold tracking-tight text-foreground">
              Web TV
            </h1>
            <p className="text-xs font-light tracking-widest text-muted-foreground uppercase">
              Schedule &amp; Transcripts
            </p>
          </div>
        </header>

        <div className="py-6">
          <Suspense fallback={<div>Loading...</div>}>
            <VideoTable videos={videos} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
