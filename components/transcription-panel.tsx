'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SpeakerMapping } from '@/lib/speakers';
import type { Video, VideoMetadata } from '@/lib/un-api';
import { getCountryName } from '@/lib/country-lookup';
import { ChevronDown } from 'lucide-react';
import ExcelJS from 'exceljs';

interface TranscriptionPanelProps {
  kalturaId: string;
  player?: {
    currentTime: number;
    play: () => void;
  };
  video: Video;
  metadata: VideoMetadata;
}

interface Word {
  text: string;
  speaker?: string | null; // AssemblyAI uses "speaker" (e.g., "A", "B", "C")
  start: number; // Milliseconds
  end: number; // Milliseconds
}

interface Paragraph {
  text: string;
  start: number; // Milliseconds
  end: number; // Milliseconds
  words: Word[];
}

interface SpeakerSegment {
  speaker: string;
  paragraphs: Paragraph[];
  timestamp: number;
  paragraphIndices?: number[]; // Track original paragraph indices for speaker lookup
}


export function TranscriptionPanel({ kalturaId, player, video }: TranscriptionPanelProps) {
  const [paragraphs, setParagraphs] = useState<Paragraph[] | null>(null);
  const [segments, setSegments] = useState<SpeakerSegment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [checking, setChecking] = useState(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [showCopied, setShowCopied] = useState(false);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(-1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [identifyingSpeakers, setIdentifyingSpeakers] = useState(false);
  const [countryNames, setCountryNames] = useState<Map<string, string>>(new Map());
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const paragraphRefs = useRef<Map<string, HTMLParagraphElement>>(new Map());
  const wordRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const downloadButtonRef = useRef<HTMLDivElement>(null);

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

  const getSpeakerText = (paragraphIndex: number | undefined): string => {
    if (paragraphIndex === undefined) {
      return 'Speaker';
    }
    
    const info = speakerMappings[paragraphIndex.toString()];
    
    if (!info || (!info.affiliation && !info.group && !info.function && !info.name)) {
      return `Speaker ${paragraphIndex + 1}`;
    }
    
    const parts: string[] = [];
    
    if (info.affiliation) {
      parts.push(countryNames.get(info.affiliation) || info.affiliation);
    }
    
    if (info.group) {
      parts.push(info.group);
    }
    
    // Skip "Representative" as it's not very informative
    if (info.function && info.function.toLowerCase() !== 'representative') {
      parts.push(info.function);
    }
    
    if (info.name) {
      parts.push(info.name);
    }
    
    return parts.join(' · ');
  };

  const renderSpeakerInfo = (paragraphIndex: number | undefined) => {
    if (paragraphIndex === undefined) {
      return <span>Speaker</span>;
    }
    
    const info = speakerMappings[paragraphIndex.toString()];
    
    if (!info || (!info.affiliation && !info.group && !info.function && !info.name)) {
      return <span>Speaker {paragraphIndex + 1}</span>;
    }
    
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Affiliation badge */}
        {info.affiliation && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {countryNames.get(info.affiliation) || info.affiliation}
          </span>
        )}
        
        {/* Group badge */}
        {info.group && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            {info.group}
          </span>
        )}
        
        {/* Function (skip if just "Representative") */}
        {info.function && info.function.toLowerCase() !== 'representative' && (
          <span className="text-sm font-medium text-muted-foreground">
            {info.function}
          </span>
        )}
        
        {/* Name */}
        {info.name && (
          <span className="text-sm font-semibold">
            {info.name}
          </span>
        )}
      </div>
    );
  };

  const speakerHeaderClass = 'text-sm font-semibold tracking-wide text-foreground';

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

  // Helper to insert paragraph breaks within a speaker's words
  const insertParagraphBreaks = useCallback((words: Word[], originalParagraphs: Paragraph[]): Paragraph[] => {
    if (words.length === 0) return [];

    // Create a set of paragraph boundary timestamps
    const paragraphBoundaries = new Set(
      originalParagraphs.map(p => p.start / 1000)
    );

    const paragraphs: Paragraph[] = [];
    let currentParagraphWords: Word[] = [];
    let currentParagraphStart = words[0].start;

    words.forEach((word, index) => {
      currentParagraphWords.push(word);

      // Check if next word starts a new paragraph
      const nextWord = words[index + 1];
      if (nextWord && paragraphBoundaries.has(nextWord.start)) {
        // End current paragraph
        paragraphs.push({
          text: currentParagraphWords.map(w => w.text).join(' '),
          start: currentParagraphStart,
          end: word.end,
          words: currentParagraphWords,
        });
        currentParagraphWords = [];
        currentParagraphStart = nextWord.start;
      }
    });

    // Add final paragraph
    if (currentParagraphWords.length > 0) {
      paragraphs.push({
        text: currentParagraphWords.map(w => w.text).join(' '),
        start: currentParagraphStart,
        end: currentParagraphWords[currentParagraphWords.length - 1].end,
        words: currentParagraphWords,
      });
    }

    return paragraphs;
  }, []);

  const loadCountryNames = useCallback(async (mapping: SpeakerMapping) => {
    const names = new Map<string, string>();
    
    // Collect all ISO3 codes
    const iso3Codes = new Set<string>();
    Object.values(mapping).forEach(info => {
      if (info.affiliation && info.affiliation.length === 3) {
        iso3Codes.add(info.affiliation);
      }
    });
    
    // Load country names
    for (const code of iso3Codes) {
      const name = await getCountryName(code);
      if (name) {
        names.set(code, name);
      }
    }
    
    setCountryNames(names);
  }, []);

  const identifySpeakers = useCallback(async (paragraphsData: Paragraph[], transcriptId?: string) => {
    setIdentifyingSpeakers(true);
    try {
      const response = await fetch('/api/identify-speakers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs: paragraphsData, transcriptId, entryId: kalturaId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.mapping) {
          setSpeakerMappings(data.mapping);
          // Load country names for affiliations
          await loadCountryNames(data.mapping);
        }
      }
    } catch (err) {
      console.error('Speaker identification failed:', err);
    } finally {
      setIdentifyingSpeakers(false);
    }
  }, [kalturaId, loadCountryNames]);

  // Group paragraphs by OpenAI-identified speaker (using paragraph-level mapping)
  const groupParagraphsBySpeaker = useCallback((paragraphsData: Paragraph[], mappings: SpeakerMapping): SpeakerSegment[] => {
    const segments: SpeakerSegment[] = [];
    
    if (paragraphsData.length === 0) return segments;
    
    let currentSegment: SpeakerSegment | null = null;
    
    paragraphsData.forEach((para, index) => {
      const speakerInfo = mappings[index.toString()];
      const speakerId = JSON.stringify(speakerInfo || {}); // Use stringified info as unique ID
      
      // Convert timestamp from ms to seconds
      const paraWithSeconds = {
        ...para,
        start: para.start / 1000,
        end: para.end / 1000,
        words: para.words.map(w => ({
          ...w,
          start: w.start / 1000,
          end: w.end / 1000,
        })),
      };
      
      if (!currentSegment || currentSegment.speaker !== speakerId) {
        // Start a new segment
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          speaker: speakerId,
          paragraphs: [paraWithSeconds],
          timestamp: paraWithSeconds.start,
          paragraphIndices: [index],
        };
      } else {
        // Add to current segment
        currentSegment.paragraphs.push(paraWithSeconds);
        currentSegment.paragraphIndices?.push(index);
      }
    });
    
    // Add final segment
    if (currentSegment) {
      segments.push(currentSegment);
    }
    
    return segments;
  }, []);

  // Regenerate segments when speaker mappings change
  useEffect(() => {
    if (paragraphs && Object.keys(speakerMappings).length > 0) {
      setSegments(groupParagraphsBySpeaker(paragraphs, speakerMappings));
    }
  }, [paragraphs, speakerMappings, groupParagraphsBySpeaker]);

  const formatParagraphs = useCallback((paragraphsData: Paragraph[]): SpeakerSegment[] => {
    // Flatten all words from paragraphs and convert timestamps
    const allWords = paragraphsData.flatMap(para => 
      para.words.map(word => ({
        ...word,
        start: word.start / 1000,
        end: word.end / 1000,
      }))
    );

    // First, group words by speaker
    const segments: SpeakerSegment[] = [];
    let currentSpeaker: string | null = null;
    let currentWords: Word[] = [];
    let currentTimestamp = 0;

    allWords.forEach((word) => {
      const speaker = word.speaker || 'Unknown';
      
      if (speaker !== currentSpeaker) {
        if (currentWords.length > 0) {
          // Now insert paragraph breaks within this speaker segment
          const paragraphs = insertParagraphBreaks(currentWords, paragraphsData);
          segments.push({
            speaker: currentSpeaker || 'Unknown',
            paragraphs,
            timestamp: currentTimestamp,
          });
        }
        currentSpeaker = speaker;
        currentWords = [word];
        currentTimestamp = word.start;
      } else {
        currentWords.push(word);
      }
    });

    if (currentWords.length > 0) {
      const paragraphs = insertParagraphBreaks(currentWords, paragraphsData);
      segments.push({
        speaker: currentSpeaker || 'Unknown',
        paragraphs,
        timestamp: currentTimestamp,
      });
    }

    return segments;
  }, [insertParagraphBreaks]);

  const handleTranscribe = async (force = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // For finished videos, check if we have a complete transcript
      if (!force) {
        const segmentsResponse = await fetch('/api/transcribe/segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kalturaId,
            currentTime: 0,
            totalDuration: 0, // Will be calculated from video
            isComplete: true,
          }),
        });

        if (segmentsResponse.ok) {
          const segmentData = await segmentsResponse.json();
          
          // If partial transcripts exist but no complete one, force retranscription
          if (segmentData.needsFullRetranscription) {
            console.log('Partial transcripts found, retranscribing completely');
            force = true;
          }
        }
      }

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
      
      // If cached/completed transcript with paragraphs
      if (data.paragraphs && data.paragraphs.length > 0) {
        setParagraphs(data.paragraphs);
        setSegments(formatParagraphs(data.paragraphs));
        setCached(data.cached || false);
        
        // Load speaker mappings if cached
        if (data.cached && data.transcriptId) {
          try {
            const speakerResponse = await fetch('/api/get-speaker-mapping', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcriptId: data.transcriptId }),
            });
            if (speakerResponse.ok) {
              const speakerData = await speakerResponse.json();
              if (speakerData.mapping) {
                setSpeakerMappings(speakerData.mapping);
                await loadCountryNames(speakerData.mapping);
              }
            }
          } catch (err) {
            console.log('Failed to load speaker mappings:', err);
          }
        }
        
        // Identify speakers for new transcripts
        if (!data.cached) {
          identifySpeakers(data.paragraphs, data.transcriptId);
        }
      } 
      // If new transcript submitted, poll for completion
      else if (data.transcriptId) {
        console.log('Polling for transcript:', data.transcriptId);
        
        let pollCount = 0;
        const maxPolls = 200; // Max ~10 minutes (3s * 200)
        
        while (pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          pollCount++;
          
          const pollResponse = await fetch('/api/transcribe/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptId: data.transcriptId }),
          });
          
          if (!pollResponse.ok) {
            throw new Error('Failed to poll transcript status');
          }
          
          const pollData = await pollResponse.json();
          
          if (pollData.status === 'completed' && pollData.paragraphs) {
            console.log('Transcription completed');
            setParagraphs(pollData.paragraphs);
            setSegments(formatParagraphs(pollData.paragraphs));
            setCached(false);
            
            // Identify speakers after transcription completes
            identifySpeakers(pollData.paragraphs, pollData.transcriptId);
            break;
          } else if (pollData.status === 'error') {
            throw new Error(pollData.error || 'Transcription failed');
          }
          
          // Still processing, continue polling
        }
        
        if (pollCount >= maxPolls) {
          throw new Error('Transcription timeout');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const downloadDocx = () => {
    if (!segments) return;
    
    // Simple RTF format (opens in Word)
    let rtf = '{\\rtf1\\ansi\\deff0\n';
    segments.forEach(segment => {
      const firstParaIndex = segment.paragraphIndices?.[0] ?? 0;
      rtf += `{\\b ${getSpeakerText(firstParaIndex)}`;
      if (segment.timestamp !== null) {
        rtf += ` [${formatTime(segment.timestamp)}]`;
      }
      rtf += ':}\\line\\line\n';
      segment.paragraphs.forEach(para => {
        rtf += para.text.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}');
        rtf += '\\line\\line\n';
      });
    });
    rtf += '}';
    
    const blob = new Blob([rtf], { type: 'application/rtf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${video.date}_${video.cleanTitle.slice(0, 50).replace(/[^a-z0-9]/gi, '_')}.rtf`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const downloadExcel = async () => {
    if (!segments) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transcript');
    
    // Define columns
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Source Type', key: 'source_type', width: 12 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'URL', key: 'url', width: 35 },
      { header: 'Paragraph Number', key: 'paragraph_number', width: 15 },
      { header: 'Speaker Affiliation', key: 'speaker_affiliation', width: 20 },
      { header: 'Speaker Group', key: 'speaker_group', width: 20 },
      { header: 'Function', key: 'function', width: 20 },
      { header: 'Text', key: 'text', width: 60 },
    ];
    
    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    
    // Freeze header row
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];
    
    // Add data
    let paragraphNumber = 1;
    segments.forEach(segment => {
      segment.paragraphs.forEach((para, paraIndex) => {
        const globalParaIndex = segment.paragraphIndices?.[paraIndex];
        const info = globalParaIndex !== undefined ? speakerMappings[globalParaIndex.toString()] : undefined;
        
        const row = worksheet.addRow({
          date: video.date,
          source_type: 'WebTV',
          title: video.cleanTitle,
          url: video.url,
          paragraph_number: paragraphNumber++,
          speaker_affiliation: info?.affiliation ? (countryNames.get(info.affiliation) || info.affiliation) : '',
          speaker_group: info?.group || '',
          function: info?.function || '',
          text: para.text,
        });
        
        // Wrap text in all cells
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        });
      });
    });
    
    // Generate buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${video.date}_${video.cleanTitle.slice(0, 50).replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
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
          if (data.cached && data.paragraphs && data.paragraphs.length > 0) {
            setParagraphs(data.paragraphs);
            setSegments(formatParagraphs(data.paragraphs));
            setCached(true);
            
            // Load speaker mappings if available
            if (data.transcriptId) {
              try {
                const speakerResponse = await fetch('/api/get-speaker-mapping', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ transcriptId: data.transcriptId }),
                });
                if (speakerResponse.ok) {
                  const speakerData = await speakerResponse.json();
                  if (speakerData.mapping) {
                    setSpeakerMappings(speakerData.mapping);
                    await loadCountryNames(speakerData.mapping);
                  }
                }
              } catch (err) {
                console.log('Failed to load speaker mappings:', err);
              }
            }
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
  }, [kalturaId, formatParagraphs, loadCountryNames]);

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
      if (currentTime >= segments[i].timestamp) {
        setActiveSegmentIndex(i);
        return;
      }
    }
    
    setActiveSegmentIndex(-1);
  }, [currentTime, segments]);

  // Calculate active paragraph within active segment
  useEffect(() => {
    if (activeSegmentIndex < 0 || !segments || !segments[activeSegmentIndex]?.paragraphs) {
      setActiveParagraphIndex(-1);
      return;
    }

    const segment = segments[activeSegmentIndex];
    for (let i = segment.paragraphs.length - 1; i >= 0; i--) {
      const paragraph = segment.paragraphs[i];
      if (currentTime >= paragraph.start) {
        setActiveParagraphIndex(i);
        return;
      }
    }
    
    setActiveParagraphIndex(-1);
  }, [currentTime, activeSegmentIndex, segments]);

  // Calculate active word within active paragraph
  useEffect(() => {
    if (activeSegmentIndex < 0 || activeParagraphIndex < 0 || !segments) {
      setActiveWordIndex(-1);
      return;
    }

    const paragraph = segments[activeSegmentIndex]?.paragraphs[activeParagraphIndex];
    if (!paragraph?.words) {
      setActiveWordIndex(-1);
      return;
    }

    for (let i = paragraph.words.length - 1; i >= 0; i--) {
      const word = paragraph.words[i];
      if (currentTime >= word.start) {
        setActiveWordIndex(i);
        return;
      }
    }
    
    setActiveWordIndex(-1);
  }, [currentTime, activeSegmentIndex, activeParagraphIndex, segments]);

  // Auto-scroll to active paragraph (position at top 1/3 of viewport)
  useEffect(() => {
    if (activeSegmentIndex >= 0 && activeParagraphIndex >= 0) {
      const key = `${activeSegmentIndex}-${activeParagraphIndex}`;
      const element = paragraphRefs.current.get(key);
      if (element) {
        const elementTop = element.getBoundingClientRect().top + window.scrollY;
        const offset = window.innerHeight / 3;
        window.scrollTo({
          top: elementTop - offset,
          behavior: 'smooth',
        });
      }
    }
  }, [activeSegmentIndex, activeParagraphIndex]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadButtonRef.current && !downloadButtonRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    
    if (showDownloadMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDownloadMenu]);

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
              <div className="relative">
                <button
                  onClick={handleShare}
                  className="px-2.5 py-1 text-xs border border-border rounded hover:bg-muted"
                >
                  Share
                </button>
                {showCopied && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap">
                    Copied link to clipboard!
                  </div>
                )}
              </div>
              <div className="relative" ref={downloadButtonRef}>
                <button
                  onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  className="px-2.5 py-1 text-xs border border-border rounded hover:bg-muted flex items-center gap-1"
                >
                  Download
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showDownloadMenu && (
                  <div className="absolute right-0 mt-1 w-40 bg-background border border-border rounded shadow-lg z-10">
                    <button
                      onClick={downloadDocx}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-muted"
                    >
                      RTF Document
                    </button>
                    <button
                      onClick={downloadExcel}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-muted"
                    >
                      Excel Table
                    </button>
                    <button
                      onClick={() => {
                        window.open(`/json/${encodeURIComponent(video.id)}`, '_blank');
                        setShowDownloadMenu(false);
                      }}
                      className="w-full px-3 py-2 text-xs text-left hover:bg-muted"
                    >
                      JSON API
                    </button>
                  </div>
                )}
              </div>
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
      
      {identifyingSpeakers && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Identifying speakers...</span>
        </div>
      )}
      
      {segments && (
        <div className="space-y-3">
          {segments.map((segment, segmentIndex) => {
            const isSegmentActive = segmentIndex === activeSegmentIndex;
            const firstParagraphIndex = segment.paragraphIndices?.[0] ?? 0;
            return (
              <div 
                key={segmentIndex} 
                className="space-y-2 pt-3"
                ref={(el) => { segmentRefs.current[segmentIndex] = el; }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={speakerHeaderClass}>
                    {renderSpeakerInfo(firstParagraphIndex)}
                  </div>
                  <button
                    onClick={() => seekToTimestamp(segment.timestamp)}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer transition-colors"
                    title="Jump to this timestamp"
                  >
                    [{formatTime(segment.timestamp)}]
                  </button>
                </div>
                <div className={`p-4 rounded-lg transition-all duration-200 ${
                  isSegmentActive 
                    ? 'bg-primary/10 border-2 border-primary/50' 
                    : 'bg-muted/50 border-2 border-transparent'
                }`}>
                  <div className="space-y-3 text-sm leading-relaxed">
                    {segment.paragraphs.map((paragraph, paraIndex) => {
                      const isParaActive = isSegmentActive && paraIndex === activeParagraphIndex;
                      return (
                        <p 
                          key={paraIndex}
                          ref={(el) => {
                            if (el) paragraphRefs.current.set(`${segmentIndex}-${paraIndex}`, el);
                          }}
                        >
                          {paragraph.words.map((word, wordIndex) => {
                            const isWordActive = isParaActive && wordIndex === activeWordIndex;
                            
                            return (
                              <span
                                key={wordIndex}
                                ref={(el) => {
                                  if (el) wordRefs.current.set(`${segmentIndex}-${paraIndex}-${wordIndex}`, el);
                                }}
                                onClick={() => seekToTimestamp(word.start)}
                                className="relative cursor-pointer hover:opacity-70"
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
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {!segments && !loading && !error && !checking && (
        <p className="text-muted-foreground text-sm">
          Click &quot;Generate Transcript&quot; to create a text transcript of this video using AI.
        </p>
      )}
    </div>
  );
}

