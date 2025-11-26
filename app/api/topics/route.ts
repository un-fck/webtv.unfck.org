import { NextResponse } from 'next/server';
import { getScheduleVideos } from '@/lib/un-api';
import { scheduleLookbackDays } from '@/lib/config';

export const dynamic = 'force-dynamic';

interface TaggedSentence {
  text: string;
  speaker: {
    name?: string;
    affiliation?: string;
    affiliation_full?: string;
    function?: string;
  } | string;
  video_id: string;
  video_title: string;
  video_date: string;
}

interface TopicData {
  key: string;
  label: string;
  description: string;
  sentences: TaggedSentence[];
}

export async function GET() {
  try {
    // Get all UN80 videos with transcripts
    const allVideos = await getScheduleVideos(scheduleLookbackDays);
    const un80Videos = allVideos.filter(v => 
      v.cleanTitle?.toLowerCase().includes('un80') && v.hasTranscript
    );

    // Aggregate tagged sentences by topic
    const topicsMap = new Map<string, TopicData>();

    for (const video of un80Videos) {
      try {
        // Fetch transcript for this video
        const response = await fetch(`http://localhost:3000/json/${encodeURIComponent(video.id)}`);
        if (!response.ok) continue;
        
        const data = await response.json();
        const transcript = data.transcript;
        
        if (!transcript || !transcript.data) continue;

        // Extract un80_topics definitions
        const un80TopicsDict = transcript.un80_topics || [];
        const topicsById: Record<string, { key: string; label: string; description: string }> = {};
        for (const topic of un80TopicsDict) {
          topicsById[topic.key] = topic;
        }

        // Process each statement
        for (const statement of transcript.data) {
          const speaker = statement.speaker || { name: 'Unknown' };
          
          for (const paragraph of statement.paragraphs) {
            for (const sentence of paragraph.sentences) {
              const un80Topics = sentence.un80_topics || [];
              
              for (const topicRef of un80Topics) {
                const topicKey = topicRef.key;
                
                if (!topicsMap.has(topicKey)) {
                  topicsMap.set(topicKey, {
                    key: topicKey,
                    label: topicRef.label || topicKey,
                    description: topicRef.description || '',
                    sentences: []
                  });
                }
                
                topicsMap.get(topicKey)!.sentences.push({
                  text: sentence.text,
                  speaker,
                  video_id: video.id,
                  video_title: video.cleanTitle || video.title,
                  video_date: video.date
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to process video ${video.id}:`, error);
        continue;
      }
    }

    // Convert map to object
    const topics: Record<string, TopicData> = {};
    topicsMap.forEach((value, key) => {
      topics[key] = value;
    });

    const response = NextResponse.json({ topics });
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;
  } catch (error) {
    console.error('Topics API error:', error);
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    return response;
  }
}

