'use client';

import { useState, useEffect, useRef } from 'react';

interface TranscriptionPanelProps {
  kalturaId: string;
  player?: any;
}

interface Word {
  text: string;
  speaker?: string | null; // AssemblyAI uses "speaker" (e.g., "A", "B", "C")
  start?: number | null; // Milliseconds
  end?: number | null; // Milliseconds
}

interface SpeakerSegment {
  speaker: string;
  text: string;
  timestamp: number | null;
  words?: Word[];
}

export function TranscriptionPanel({ kalturaId, player }: TranscriptionPanelProps) {
  const [segments, setSegments] = useState<SpeakerSegment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [checking, setChecking] = useState(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const cleanSpeakerId = (speakerId: string): string => {
    // AssemblyAI uses single letters (A, B, C), just return as-is
    return speakerId.toUpperCase();
  };

  const getSpeakerColor = (speakerId: string): string => {
    const colors = [
      'text-blue-600 dark:text-blue-400',
      'text-green-600 dark:text-green-400',
      'text-purple-600 dark:text-purple-400',
      'text-orange-600 dark:text-orange-400',
      'text-pink-600 dark:text-pink-400',
      'text-teal-600 dark:text-teal-400',
      'text-red-600 dark:text-red-400',
      'text-indigo-600 dark:text-indigo-400',
    ];
    
    // Hash the speaker ID to get consistent colors
    const hash = speakerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const seekToTimestamp = (timestamp: number) => {
    if (!player) {
      console.log('Player not ready yet');
      return;
    }
    
    // Use Kaltura Player API directly
    try {
      console.log('Seeking to timestamp:', timestamp);
      player.currentTime = timestamp;
      player.play();
    } catch (err) {
      console.error('Failed to seek:', err);
    }
  };

  const formatTranscript = (words: Word[]): SpeakerSegment[] => {
    const segments: SpeakerSegment[] = [];
    let currentSpeaker: string | null = null;
    let currentWords: Word[] = [];
    let currentTimestamp: number | null = null;

    words.forEach((word) => {
      // Convert milliseconds to seconds for timestamps
      const wordWithSeconds = {
        ...word,
        start: word.start !== null && word.start !== undefined ? word.start / 1000 : null,
        end: word.end !== null && word.end !== undefined ? word.end / 1000 : null,
      };
      
      const speaker = word.speaker || 'Unknown';
      
      if (speaker !== currentSpeaker) {
        if (currentWords.length > 0) {
          segments.push({ 
            speaker: currentSpeaker || 'Unknown', 
            text: currentWords.map(w => w.text).join(' ').trim(),
            timestamp: currentTimestamp,
            words: currentWords
          });
        }
        currentSpeaker = speaker;
        currentWords = [wordWithSeconds];
        currentTimestamp = wordWithSeconds.start;
      } else {
        currentWords.push(wordWithSeconds);
      }
    });

    if (currentWords.length > 0) {
      segments.push({ 
        speaker: currentSpeaker || 'Unknown', 
        text: currentWords.map(w => w.text).join(' ').trim(),
        timestamp: currentTimestamp,
        words: currentWords
      });
    }

    return segments;
  };

  const handleTranscribe = async (force = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kalturaId, force }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transcription failed');
      }
      
      const data = await response.json();
      if (data.words && data.words.length > 0) {
        setSegments(formatTranscript(data.words));
      }
      setCached(data.cached || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe');
    } finally {
      setLoading(false);
    }
  };

  const handleRetranscribe = async () => {
    setSegments(null);
    setCached(false);
    await handleTranscribe(true);
  };

  const downloadDocx = () => {
    if (!segments) return;
    
    // Simple RTF format (opens in Word)
    let rtf = '{\\rtf1\\ansi\\deff0\n';
    segments.forEach(segment => {
      rtf += `{\\b Speaker ${cleanSpeakerId(segment.speaker)}`;
      if (segment.timestamp !== null) {
        rtf += ` [${formatTime(segment.timestamp)}]`;
      }
      rtf += ':}\\line\n';
      rtf += segment.text.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}');
      rtf += '\\line\\line\n';
    });
    rtf += '}';
    
    const blob = new Blob([rtf], { type: 'application/rtf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${kalturaId}.rtf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check for cached transcript on mount
  useEffect(() => {
    const checkCache = async () => {
      try {
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kalturaId, checkOnly: true }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.cached && data.words && data.words.length > 0) {
            setSegments(formatTranscript(data.words));
            setCached(true);
          }
        }
      } catch (err) {
        // Silent fail on cache check
        console.log('Cache check failed:', err);
      } finally {
        setChecking(false);
      }
    };

    checkCache();
  }, [kalturaId]);

  // Listen to player time updates with high frequency polling
  useEffect(() => {
    if (!player) return;

    let animationFrameId: number;

    const updateTime = () => {
      try {
        const time = player.currentTime;
        setCurrentTime(time);
      } catch (err) {
        console.log('Failed to get current time:', err);
      }
      animationFrameId = requestAnimationFrame(updateTime);
    };

    animationFrameId = requestAnimationFrame(updateTime);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [player]);

  // Calculate active segment based on current time
  useEffect(() => {
    if (!segments || segments.length === 0) {
      setActiveSegmentIndex(-1);
      return;
    }

    // Find the segment that should be active based on current time
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].timestamp !== null && currentTime >= segments[i].timestamp!) {
        setActiveSegmentIndex(i);
        return;
      }
    }
    
    setActiveSegmentIndex(-1);
  }, [currentTime, segments]);

  // Calculate active word within active segment
  useEffect(() => {
    if (activeSegmentIndex < 0 || !segments || !segments[activeSegmentIndex]?.words) {
      setActiveWordIndex(-1);
      return;
    }

    const segment = segments[activeSegmentIndex];
    for (let i = segment.words!.length - 1; i >= 0; i--) {
      const word = segment.words![i];
      if (word.start !== null && word.start !== undefined && currentTime >= word.start) {
        setActiveWordIndex(i);
        return;
      }
    }
    
    setActiveWordIndex(-1);
  }, [currentTime, activeSegmentIndex, segments]);

  // Auto-scroll to active segment (position at top 1/3 of viewport)
  useEffect(() => {
    if (activeSegmentIndex >= 0 && segmentRefs.current[activeSegmentIndex]) {
      const element = segmentRefs.current[activeSegmentIndex];
      if (element) {
        const elementTop = element.getBoundingClientRect().top + window.scrollY;
        const offset = window.innerHeight / 3;
        window.scrollTo({
          top: elementTop - offset,
          behavior: 'smooth',
        });
      }
    }
  }, [activeSegmentIndex]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Transcript</h2>
        <div className="flex gap-2">
          {!segments && !checking && (
            <button
              onClick={() => handleTranscribe()}
              disabled={loading}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Transcribing...' : 'Generate'}
            </button>
          )}
          {segments && (
            <>
              <button
                onClick={handleRetranscribe}
                disabled={loading}
                className="px-2.5 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Retranscribe
              </button>
              <button
                onClick={downloadDocx}
                className="px-2.5 py-1 text-xs border border-border rounded hover:bg-muted"
              >
                Download
              </button>
            </>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      {checking && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Checking for existing transcript...</span>
        </div>
      )}
      
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Generating transcript... This may take several minutes for long videos.</span>
        </div>
      )}
      
      {segments && (
        <div className="space-y-3">
          {cached && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <span>✓</span> Loaded from cache
            </div>
          )}
          {segments.map((segment, index) => {
            const isActive = index === activeSegmentIndex;
            return (
              <div 
                key={index} 
                className="space-y-1"
                ref={(el) => { segmentRefs.current[index] = el; }}
              >
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-semibold uppercase tracking-wide ${getSpeakerColor(segment.speaker)}`}>
                    Speaker {cleanSpeakerId(segment.speaker)}
                  </div>
                  {segment.timestamp != null && (
                    <button
                      onClick={() => seekToTimestamp(segment.timestamp!)}
                      className="text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer transition-colors"
                      title="Jump to this timestamp"
                    >
                      [{formatTime(segment.timestamp)}]
                    </button>
                  )}
                </div>
                <div 
                  className={`p-4 rounded-lg transition-all duration-200 ${
                    isActive 
                      ? 'bg-primary/10 border-2 border-primary/50' 
                      : 'bg-muted/50 border-2 border-transparent'
                  }`}
                >
                  <div className="relative text-sm leading-relaxed">
                    {segment.words ? (
                      <p>
                        {segment.words.map((word, wordIndex) => {
                          const isWordActive = isActive && wordIndex === activeWordIndex;
                          const hasTimestamp = word.start !== null && word.start !== undefined;
                          
                          return (
                            <span
                              key={wordIndex}
                              ref={(el) => {
                                if (el) wordRefs.current.set(`${index}-${wordIndex}`, el);
                              }}
                              onClick={() => hasTimestamp && seekToTimestamp(word.start!)}
                              className={`relative ${hasTimestamp ? 'cursor-pointer hover:opacity-70' : ''}`}
                              style={{
                                textDecoration: isWordActive ? 'underline' : 'none',
                                textDecorationColor: isWordActive ? 'hsl(var(--primary))' : 'transparent',
                                textDecorationThickness: '2px',
                                textUnderlineOffset: '3px',
                              }}
                            >
                              {word.text}{' '}
                            </span>
                          );
                        })}
                      </p>
                    ) : (
                      <p>{segment.text}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {!segments && !loading && !error && !checking && (
        <p className="text-muted-foreground text-sm">
          Click "Generate Transcript" to create a text transcript of this video using AI.
        </p>
      )}
    </div>
  );
}

