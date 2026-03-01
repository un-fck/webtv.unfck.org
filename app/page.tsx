import { Suspense } from 'react';
import { getScheduleVideos } from '@/lib/un-api';
import { VideoTable } from '@/components/video-table';
import Image from 'next/image';
import Link from 'next/link';
import { scheduleLookbackDays } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function Home() {
    const videos = await getScheduleVideos(scheduleLookbackDays);

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
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-semibold mb-2">
                            UN Web TV 2.0
                        </h1>
                        <Link
                            href="/tracker"
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-accent"
                        >
                            Undercurrents &rarr;
                        </Link>
                    </div>
                </header>

                <Suspense fallback={<div>Loading...</div>}>
                    <VideoTable videos={videos} />
                </Suspense>
            </div>
        </main>
    );
}
