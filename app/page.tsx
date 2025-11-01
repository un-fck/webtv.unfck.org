import { Suspense } from 'react';
import { getScheduleVideos } from '@/lib/un-api';
import { VideoTable } from '@/components/video-table';
import Image from 'next/image';

export default async function Home() {
    const videos = await getScheduleVideos(90); // Fetch last 90 days

    return (
        <main className="min-h-screen bg-background px-4 sm:px-6">
            <div className="max-w-[1600px] mx-auto py-8">
                <Image
                    src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
                    alt="UN Logo"
                    width={200}
                    height={40}
                    className="h-10 w-auto mb-8"
                />

                <header className="mb-8">
                    <h1 className="text-3xl font-semibold mb-2">
                        UN Web TV 2.0
                    </h1>
                    <p className="text-muted-foreground">
                        {videos.length} videos from the past 90 days
                    </p>
                </header>

                <Suspense fallback={<div>Loading...</div>}>
                    <VideoTable videos={videos} />
                </Suspense>
            </div>
        </main>
    );
}
