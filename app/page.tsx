import { Suspense } from "react";
import { getScheduleVideos } from "@/lib/un-api";
import { VideoTable } from "@/components/video-table";
import Image from "next/image";
import { scheduleLookbackDays } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const videos = await getScheduleVideos(scheduleLookbackDays);

  return (
    <main className="min-h-screen bg-background px-4 sm:px-6">
      <div className="mx-auto max-w-[1600px] py-8">
        <Image
          src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
          alt="UN Logo"
          width={200}
          height={40}
          className="mb-8 h-10 w-auto"
        />

        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-semibold">UN Web TV 2.0</h1>
        </header>

        <Suspense fallback={<div>Loading...</div>}>
          <VideoTable videos={videos} />
        </Suspense>
      </div>
    </main>
  );
}
