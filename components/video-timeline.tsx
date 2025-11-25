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
        // Check if it's an IAHWG session (should be on left)
        const isIAHWG = title.includes('iahwg') || title.includes('informal ad hoc working group');
        return { video, date, isIAHWG };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime()); // Descending order (newest first)

    return parsedEvents;
  }, [videos]);

  if (events.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No UN80 initiative videos found
      </div>
    );
  }

  // Calculate positions with unified chronological positioning
  const positions = useMemo(() => {
    const minCardHeight = 100; // Estimated card height
    const minSpacing = 30; // Minimum spacing between consecutive cards
    
    // Step 1: Calculate proportional positions based on dates
    const dates = events.map(e => e.date.getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const dateRange = maxDate - minDate || 1;
    
    // Calculate adaptive scale: compact but proportional
    const daysSpan = dateRange / (1000 * 60 * 60 * 24);
    const totalHeight = Math.max(daysSpan * 15, 300);
    
    // Since events are sorted newest first, calculate position from newest (maxDate)
    const idealPositions = events.map(event => {
      const timeSinceNewest = maxDate - event.date.getTime();
      return (timeSinceNewest / dateRange) * totalHeight;
    });
    
    // Step 2: Prevent overlaps (unified approach - all events together)
    const finalPositions: number[] = [];
    let previousBottom = 0;
    
    events.forEach((event, index) => {
      const idealPosition = idealPositions[index];
      
      // Ensure minimum spacing from previous card
      const actualPosition = Math.max(idealPosition, previousBottom + minSpacing);
      
      finalPositions.push(actualPosition);
      previousBottom = actualPosition + minCardHeight;
    });
    
    return finalPositions;
  }, [events]);

  return (
    <div className="relative py-8">
      {/* Legend at top */}
      <div className="mb-12">
        <div className="relative flex items-center justify-center">
          <div className="absolute left-0 right-0 flex items-center">
            <div className="flex-1 text-right pr-8 text-sm text-gray-600 font-medium">
              ← IAHWG Sessions
            </div>
            <div className="w-0.5"></div>
            <div className="flex-1 text-left pl-8 text-sm text-gray-600 font-medium">
              Other Sessions →
            </div>
          </div>
        </div>
      </div>

      {/* Central vertical line */}
      <div className="absolute left-1/2 w-0.5 bg-gray-300 -translate-x-1/2" style={{ top: '80px', height: `${Math.max(...positions) + 200}px` }} />

      {/* Timeline events */}
      <div className="relative" style={{ marginTop: '20px' }}>
        {events.map((event, index) => {
          const isLeft = event.isIAHWG;

          return (
            <div
              key={event.video.id}
              className="absolute w-full"
              style={{ top: `${positions[index]}px` }}
            >
              {/* Center reference line at 24px from card top */}
              
              {/* Timeline dot - 10px diameter, centered on reference */}
              <div 
                className="absolute left-1/2 z-10"
                style={{ 
                  top: '24px',
                  width: '10px',
                  height: '10px',
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div 
                  className={`w-full h-full rounded-full ${
                    isLeft ? 'bg-blue-500' : 'bg-gray-400'
                  }`} 
                />
              </div>

              {/* Horizontal connector line - centered on same reference */}
              <div
                className={`absolute bg-gray-300 ${
                  isLeft ? 'right-1/2' : 'left-1/2'
                }`}
                style={{ 
                  top: '24px',
                  height: '2px',
                  width: '60px',
                  transform: 'translateY(-50%)',
                  [isLeft ? 'marginRight' : 'marginLeft']: '5px'
                }}
              />

              {/* Content card */}
              <div
                className={`absolute w-[calc(50%-80px)] ${
                  isLeft ? 'right-1/2 mr-16 text-right' : 'left-1/2 ml-16'
                }`}
                style={{ top: '0px' }}
              >
                <div className="p-4">
                  {/* Date */}
                  <div className="text-xs text-gray-500 mb-2">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

