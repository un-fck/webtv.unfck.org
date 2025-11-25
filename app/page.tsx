import { Suspense } from 'react';
import { getScheduleVideos } from '@/lib/un-api';
import { VideoTimeline } from '@/components/video-timeline';
import Image from 'next/image';
import { scheduleLookbackDays } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function Home() {
    const allVideos = await getScheduleVideos(scheduleLookbackDays);
    
    // Filter videos to only show those including "UN80" (case-insensitive)
    const videos = allVideos.filter(video => 
        video.cleanTitle?.toLowerCase().includes('un80')
    );

    return (
        <main className="min-h-screen bg-background px-4 sm:px-6">
            <div className="max-w-[1400px] mx-auto py-8">
                <Image
                    src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
                    alt="UN Logo"
                    width={200}
                    height={40}
                    className="h-10 w-auto mb-8"
                />

                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-light tracking-wide text-gray-800">
                        UN80 Transcripts
                    </h1>
                </header>

                <Suspense fallback={<div className="text-center text-gray-500">Loading...</div>}>
                    <VideoTimeline videos={videos} />
                </Suspense>
            </div>
        </main>
    );
}
