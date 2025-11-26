'use client';

import { useMemo } from 'react';
import { Video } from '@/lib/un-api';

// Apply UN Web TV's timezone workaround
function parseUNTimestamp(timestamp: string): Date {
  const dateTimeWithoutTz = timestamp.slice(0, 19);
  return new Date(dateTimeWithoutTz + 'Z');
}

interface TimelineEvent {
  video: Video;
  date: Date;
  isIAHWG: boolean;
}

export function VideoTimeline({ videos }: { videos: Video[] }) {
  const events = useMemo(() => {
    // Parse and sort videos by date (newest first)
    const parsedEvents: TimelineEvent[] = videos
      .map(video => {
        const date = video.scheduledTime 
          ? parseUNTimestamp(video.scheduledTime)
          : new Date(video.date);
        const title = video.cleanTitle?.toLowerCase() || '';
        // Check if it's an IAHWG session
        const isIAHWG = title.includes('iahwg') || title.includes('informal ad hoc working group');
        return { video, date, isIAHWG };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime()); // Descending order (newest first)

    return parsedEvents;
  }, [videos]);

  if (events.length === 0) {
    return (
      <div className="text-gray-500 py-12">
        No UN80 initiative videos found
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* Legend */}
      <div className="mb-8 flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>IAHWG Sessions</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400"></div>
          <span>Other Sessions</span>
        </div>
      </div>

      {/* Timeline - left aligned with vertical line */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[5px] top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* Events */}
        <div className="space-y-6 pl-8">
          {events.map((event) => (
            <div key={event.video.id} className="relative">
              {/* Colored dot - centered on line */}
              <div 
                className={`absolute left-[-32px] top-[6px] w-3 h-3 rounded-full ${
                  event.isIAHWG ? 'bg-blue-500' : 'bg-gray-400'
                }`}
              ></div>

              {/* Content */}
              <div className="pb-2">
                {/* Date */}
                <div className="text-xs text-gray-500 mb-1">
                  {event.date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {' '}
                  {event.date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </div>

                {/* Title */}
                <a
                  href={`/video/${encodeURIComponent(event.video.id)}`}
                  className="block text-sm font-medium text-gray-800 hover:text-blue-600 transition-colors"
                >
                  {event.video.cleanTitle}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
