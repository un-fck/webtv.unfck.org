'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SpeakerMapping } from '@/lib/speakers';
import type { Video, VideoMetadata } from '@/lib/un-api';
import { getCountryName } from '@/lib/country-lookup';
import { ChevronDown, FoldVertical, UnfoldVertical } from 'lucide-react';
import ExcelJS from 'exceljs';

const TOPIC_COLOR_PALETTE = [
  '#5b8dc9', // blue
  '#5eb87d', // green
  '#9b7ac9', // purple
  '#e67c5a', // coral
  '#4db8d4', // cyan
  '#d4a834', // gold
  '#7aad6f', // sage
  '#d46ba3', // pink
  '#5aa7d4', // sky blue
  '#c98d4d', // orange
];

function getTopicColor(topicKey: string, allTopicKeys: string[]): string {
  const index = allTopicKeys.indexOf(topicKey);
  return TOPIC_COLOR_PALETTE[index % TOPIC_COLOR_PALETTE.length];
}

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

interface SpeakerSegment {
  speaker: string; // Stringified speaker info for identity comparison
  statementIndices: number[]; // Direct references to statements
  timestamp: number;
}

interface Statement {
  paragraphs: Array<{
    sentences: Array<{
      text: string;
      start: number; // Milliseconds
      end: number; // Milliseconds
      topic_keys?: string[];
      words?: Word[];
    }>;
    start: number; // Milliseconds
    end: number; // Milliseconds
    words: Word[];
  }>;
  start: number; // Milliseconds - overall statement timing
  end: number; // Milliseconds - overall statement timing
  words: Word[]; // All words for the statement
}

export function TranscriptionPanel({ kalturaId, player, video }: TranscriptionPanelProps) {
  const [segments, setSegments] = useState<SpeakerSegment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setCached] = useState(false);
  const [checking, setChecking] = useState(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [showCopied, setShowCopied] = useState(false);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [identifyingSpeakers, setIdentifyingSpeakers] = useState(false);
  const [countryNames, setCountryNames] = useState<Map<string, string>>(new Map());
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [topics, setTopics] = useState<Record<string, { key: string; label: string; description: string }>>({});
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicCollapsed, setTopicCollapsed] = useState<boolean>(true);
  const [activeStatementIndex, setActiveStatementIndex] = useState<number>(-1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(-1);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const downloadButtonRef = useRef<HTMLDivElement>(null);

  // Filter segments by selected topic

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

  const getSpeakerText = (statementIndex: number | undefined): string => {
    if (statementIndex === undefined) {
      return 'Speaker';
    }
    
    const info = speakerMappings[statementIndex.toString()];
    
    if (!info || (!info.affiliation && !info.group && !info.function && !info.name)) {
      return `Speaker ${statementIndex + 1}`;
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

  const renderSpeakerInfo = (statementIndex: number | undefined) => {
    if (statementIndex === undefined) {
      return <span>Speaker</span>;
    }
    
    const info = speakerMappings[statementIndex.toString()];
    
    if (!info || (!info.affiliation && !info.group && !info.function && !info.name)) {
      return <span>Speaker {statementIndex + 1}</span>;
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
  // Group statements by consecutive same speaker
  const groupStatementsBySpeaker = useCallback((statementsData: Statement[], mappings: SpeakerMapping): SpeakerSegment[] => {
    const segments: SpeakerSegment[] = [];
    
    if (statementsData.length === 0) return segments;
    
    let currentSegment: SpeakerSegment | null = null;
    
    statementsData.forEach((stmt, index) => {
      const speakerInfo = mappings[index.toString()];
      const speakerId = JSON.stringify(speakerInfo || {}); // Use stringified info as unique ID
      
      // Get timestamp from first paragraph's first sentence
      const timestamp = stmt.paragraphs[0]?.sentences[0]?.start ? stmt.paragraphs[0].sentences[0].start / 1000 : 0;
      
      if (!currentSegment || currentSegment.speaker !== speakerId) {
        // Start a new segment
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          speaker: speakerId,
          statementIndices: [index],
          timestamp,
        };
      } else {
        // Add to current segment
        currentSegment.statementIndices.push(index);
      }
    });
    
    // Add final segment
    if (currentSegment) {
      segments.push(currentSegment);
    }
    
    return segments;
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

  // Regenerate segments when speaker mappings or statements change
  useEffect(() => {
    if (statements && Object.keys(speakerMappings).length > 0) {
      setSegments(groupStatementsBySpeaker(statements, speakerMappings));
    }
  }, [statements, speakerMappings, groupStatementsBySpeaker]);

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
      
      // If we got statements directly (cached), use them
      if (data.statements && data.statements.length > 0) {
        setStatements(data.statements);
        setCached(data.cached || false);
        
        // Load topics
        if (data.topics) {
          setTopics(data.topics);
        }
      }
        
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
      } else if (data.transcriptId) {
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
          
          if (pollData.status === 'completed' && pollData.statements) {
            console.log('Transcription completed');
            setStatements(pollData.statements);
            setCached(false);
            
            if (pollData.topics) {
              setTopics(pollData.topics);
            }
            
            // Load speaker mappings
            if (pollData.transcriptId) {
              try {
                const speakerResponse = await fetch('/api/get-speaker-mapping', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ transcriptId: pollData.transcriptId }),
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

  const escapeRtf = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/[\u0080-\uffff]/g, (char) => {
        // Encode Unicode characters as \uN? where N is the decimal code point
        const code = char.charCodeAt(0);
        return `\\u${code}?`;
      });
  };

  const downloadDocx = () => {
    if (!segments || !statements) return;
    
    // Simple RTF format (opens in Word)
    let rtf = '{\\rtf1\\ansi\\deff0\n';
    segments.forEach(segment => {
      const firstStmtIndex = segment.statementIndices[0] ?? 0;
      rtf += `{\\b ${escapeRtf(getSpeakerText(firstStmtIndex))}`;
      if (segment.timestamp !== null) {
        rtf += ` [${formatTime(segment.timestamp)}]`;
      }
      rtf += ':}\\line\\line\n';
      
      segment.statementIndices.forEach(stmtIdx => {
        const stmt = statements[stmtIdx];
        if (stmt) {
          stmt.paragraphs.forEach(para => {
            const text = para.sentences.map(s => s.text).join(' ');
            rtf += escapeRtf(text);
            rtf += '\\line\\line\n';
          });
        }
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
    
    // Get all topic labels for column headers
    const topicList = Object.values(topics);
    const topicKeys = topicList.map(t => `topic_${t.key}`);
    
    // Define base columns
    const baseColumns = [
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
    
    // Add topic columns
    const topicColumns = topicList.map(topic => ({
      header: `Topic ${topic.label}`,
      key: `topic_${topic.key}`,
      width: 15
    }));
    
    worksheet.columns = [...baseColumns, ...topicColumns];
    
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
      segment.statementIndices.forEach(stmtIdx => {
        const info = speakerMappings[stmtIdx.toString()];
        const stmt = statements?.[stmtIdx];
        
        if (stmt) {
          stmt.paragraphs.forEach(para => {
            const text = para.sentences.map(s => s.text).join(' ');
            
            // Collect all topic keys from sentences in this paragraph
            const paragraphTopics = new Set<string>();
            para.sentences.forEach(sent => {
              sent.topic_keys?.forEach(key => paragraphTopics.add(key));
            });
            
            // Build row data with base columns
            const rowData: Record<string, string | number> = {
              date: video.date,
              source_type: 'WebTV',
              title: video.cleanTitle,
              url: video.url,
              paragraph_number: paragraphNumber++,
              speaker_affiliation: info?.affiliation ? (countryNames.get(info.affiliation) || info.affiliation) : '',
              speaker_group: info?.group || '',
              function: info?.function || '',
              text,
            };
            
            // Add topic columns
            topicList.forEach(topic => {
              rowData[`topic_${topic.key}`] = paragraphTopics.has(topic.key) ? 'Yes' : '';
            });
            
            const row = worksheet.addRow(rowData);
            
            // Wrap text in all cells
            row.eachCell((cell) => {
              cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
            });
          });
        }
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
          
          // Load cached transcript
          if (data.cached && data.statements && data.statements.length > 0) {
            setStatements(data.statements);
            setCached(true);
            
            // Load topics
            if (data.topics) {
              setTopics(data.topics);
            }
          }
          
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
      } catch (err) {
        // Silent fail on cache check
        console.log('Cache check failed:', err);
      } finally {
        setChecking(false);
      }
    };

    checkCache();
  }, [kalturaId, loadCountryNames]);

  // Listen to player time updates with high frequency polling
  useEffect(() => {
    if (!player) return;

    let animationFrameId: number;
    let lastTime = -1;

    const updateTime = () => {
      try {
        const time = player.currentTime;
        // Only update if time has changed significantly (more than 0.01 seconds)
        if (Math.abs(time - lastTime) > 0.01) {
          setCurrentTime(time);
          lastTime = time;
        }
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

  // Calculate all active indices in a single effect (avoids cascading effects)
  useEffect(() => {
    if (!segments || !statements || statements.length === 0) {
      setActiveSegmentIndex(-1);
      setActiveStatementIndex(-1);
      setActiveParagraphIndex(-1);
      setActiveSentenceIndex(-1);
      setActiveWordIndex(-1);
      return;
    }

    // Find active segment
    let newSegmentIdx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].timestamp) {
        newSegmentIdx = i;
        break;
      }
    }

    // Find active statement (scan all statements by time)
    let newStmtIdx = -1;
    for (let i = statements.length - 1; i >= 0; i--) {
      const stmt = statements[i];
      if (stmt?.paragraphs?.[0]?.sentences?.[0]) {
        const stmtStart = stmt.paragraphs[0].sentences[0].start / 1000;
        if (currentTime >= stmtStart) {
          newStmtIdx = i;
          break;
        }
      }
    }

    // Find active paragraph within statement
    let newParaIdx = -1;
    if (newStmtIdx >= 0) {
      const stmt = statements[newStmtIdx];
      if (stmt?.paragraphs) {
        for (let i = stmt.paragraphs.length - 1; i >= 0; i--) {
          const para = stmt.paragraphs[i];
          if (para.sentences?.[0]) {
            const paraStart = para.sentences[0].start / 1000;
            if (currentTime >= paraStart) {
              newParaIdx = i;
              break;
            }
          }
        }
      }
    }

    // Find active sentence within paragraph
    let newSentIdx = -1;
    if (newStmtIdx >= 0 && newParaIdx >= 0) {
      const para = statements[newStmtIdx]?.paragraphs?.[newParaIdx];
      if (para?.sentences) {
        for (let i = para.sentences.length - 1; i >= 0; i--) {
          if (currentTime >= para.sentences[i].start / 1000) {
            newSentIdx = i;
            break;
          }
        }
      }
    }

    // Find active word within sentence
    let newWordIdx = -1;
    if (newStmtIdx >= 0 && newParaIdx >= 0 && newSentIdx >= 0) {
      const sentence = statements[newStmtIdx]?.paragraphs?.[newParaIdx]?.sentences?.[newSentIdx];
      if (sentence?.words) {
        for (let i = sentence.words.length - 1; i >= 0; i--) {
          if (currentTime >= sentence.words[i].start / 1000) {
            newWordIdx = i;
            break;
          }
        }
      }
    }

    // Batch state updates (React will batch these)
    setActiveSegmentIndex(newSegmentIdx);
    setActiveStatementIndex(newStmtIdx);
    setActiveParagraphIndex(newParaIdx);
    setActiveSentenceIndex(newSentIdx);
    setActiveWordIndex(newWordIdx);
  }, [currentTime, segments, statements]);

  // Auto-scroll to active paragraph
  // Only scroll if paragraph changed and is roughly within current view
  const lastScrolledKey = useRef<string | null>(null);
  
  useEffect(() => {
    if (activeStatementIndex < 0 || activeParagraphIndex < 0) return;
    
    const key = `${activeStatementIndex}-${activeParagraphIndex}`;
    
    // Don't scroll if we already scrolled to this paragraph
    if (lastScrolledKey.current === key) return;
    
    const element = document.querySelector<HTMLElement>(`[data-paragraph-key="${key}"]`);
    if (!element) return;
    
    // Find the scroll container (the transcript panel)
    const scrollContainer = element.closest('.overflow-y-auto');
    if (!scrollContainer) return;
    
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Calculate positions relative to the container
    const elementTopInContainer = elementRect.top - containerRect.top + scrollContainer.scrollTop;
    const containerHeight = scrollContainer.clientHeight;
    
    // Only scroll if element is roughly within view (within 1.5 container heights)
    const relativeTop = elementRect.top - containerRect.top;
    const isRoughlyInView = relativeTop > -containerHeight * 1.5 && relativeTop < containerHeight * 2.5;
    
    if (isRoughlyInView) {
      const offset = containerHeight / 3;
      const targetScroll = elementTopInContainer - offset;
      scrollContainer.scrollTo({ top: targetScroll, behavior: 'smooth' });
      lastScrolledKey.current = key;
    }
  }, [activeStatementIndex, activeParagraphIndex]);


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
                      Text Document
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
      
      {checking && !loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Checking for existing transcript...</span>
        </div>
      )}
      
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
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
      
      {segments && Object.keys(topics).length > 0 && (() => {
        // Collect all used topics from statements
        const usedTopicKeys = new Set<string>();
        if (statements) {
          statements.forEach(stmt => {
            stmt.paragraphs.forEach(para => {
              para.sentences.forEach(sent => {
                sent.topic_keys?.forEach(key => usedTopicKeys.add(key));
              });
            });
          });
        }
        
        const usedTopics = Object.values(topics).filter(topic => usedTopicKeys.has(topic.key));
        
        if (usedTopics.length === 0) return null;
        
        const allTopicKeys = Object.keys(topics);
        
        return (
          <div className="mb-3 pb-3 border-b border-border/50">
            <div className="flex gap-1.5 flex-wrap">
              {usedTopics.map(topic => {
                const color = getTopicColor(topic.key, allTopicKeys);
                return (
                  <button
                    key={topic.key}
                    onClick={() => {
                      const newTopic = selectedTopic === topic.key ? null : topic.key;
                      setSelectedTopic(newTopic);
                      if (!newTopic) setTopicCollapsed(false);
                    }}
                    className={`px-2 py-0.5 rounded-full text-xs transition-all ${
                      selectedTopic === topic.key 
                        ? 'ring-1 ring-offset-1 font-medium' 
                        : 'font-normal opacity-70 hover:opacity-100'
                    }`}
                    style={{ 
                      backgroundColor: color + '50',
                      color: '#374151',
                      ...(selectedTopic === topic.key && {
                        backgroundColor: color + '90',
                        ringColor: color,
                      })
                    }}
                    title={topic.description}
                  >
                    {topic.label}
                  </button>
                );
              })}
            </div>
            {selectedTopic && (
              <div className="inline-flex items-center gap-0.5 mt-2 p-0.5 bg-gray-100 rounded text-xs">
                <button
                  onClick={() => setTopicCollapsed(true)}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    topicCollapsed 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FoldVertical className="w-3 h-3" />
                  <span>Highlights only</span>
                </button>
                <button
                  onClick={() => setTopicCollapsed(false)}
                  className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                    !topicCollapsed 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <UnfoldVertical className="w-3 h-3" />
                  <span>All content with highlights</span>
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {segments && (
        <div className="space-y-3">
          {segments.map((segment, segmentIndex) => {
            const isSegmentActive = segmentIndex === activeSegmentIndex;
            const firstStmtIndex = segment.statementIndices[0] ?? 0;
            return (
              <div 
                key={segmentIndex} 
                className="space-y-2 pt-3"
                ref={(el) => { segmentRefs.current[segmentIndex] = el; }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={speakerHeaderClass}>
                    {renderSpeakerInfo(firstStmtIndex)}
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
                    {segment.statementIndices.map((stmtIdx, indexInSegment) => {
                      const stmt = statements?.[stmtIdx];
                      
                      if (!stmt) return null;
                      
                      const isStmtActive = stmtIdx === activeStatementIndex;
                      const allTopicKeys = Object.keys(topics);
                      const highlightColor = selectedTopic ? getTopicColor(selectedTopic, allTopicKeys) : null;
                      
                          return (
                            <div key={indexInSegment} className="space-y-3">
                              {stmt.paragraphs.map((para, paraIdx) => {
                                const isParaActive = isStmtActive && paraIdx === activeParagraphIndex;
                                
                                // If topic is collapsed, skip paragraphs without highlighted sentences
                                if (topicCollapsed && selectedTopic) {
                                  const hasHighlight = para.sentences.some(sent => 
                                    sent.topic_keys?.includes(selectedTopic)
                                  );
                                  if (!hasHighlight) return null;
                                }
                                
                                return (
                                  <p 
                                    key={paraIdx}
                                    data-paragraph-key={`${stmtIdx}-${paraIdx}`}
                                  >
                                {para.sentences.map((sent, sentIdx) => {
                                  const isSentActive = isParaActive && sentIdx === activeSentenceIndex;
                                  const isHighlighted = selectedTopic && sent.topic_keys?.includes(selectedTopic);
                                  
                                  // If topic is collapsed, skip non-highlighted sentences
                                  if (topicCollapsed && selectedTopic && !isHighlighted) {
                                    return null;
                                  }
                                  
                                  // Render words if available
                                  if (sent.words && sent.words.length > 0) {
                                    if (isHighlighted && highlightColor) {
                                      return (
                                        <span
                                          key={sentIdx}
                                          className="px-2 py-1 rounded-full"
                                          style={{
                                            backgroundColor: highlightColor + '30',
                                            display: 'inline',
                                          }}
                                        >
                                          {sent.words.map((word, wordIdx) => {
                                            const isActiveWord = isSentActive && wordIdx === activeWordIndex;
                                            return (
                                              <span
                                                key={wordIdx}
                                                onClick={() => seekToTimestamp(word.start / 1000)}
                                                className="cursor-pointer hover:opacity-70"
                                                style={{
                                                  textDecoration: isActiveWord ? 'underline' : 'none',
                                                  textDecorationColor: isActiveWord ? 'hsl(var(--primary))' : 'transparent',
                                                  textDecorationThickness: '2px',
                                                  textUnderlineOffset: '3px',
                                                }}
                                              >
                                                {word.text}{' '}
                                              </span>
                                            );
                                          })}
                                        </span>
                                      );
                                    }
                                    return sent.words.map((word, wordIdx) => {
                                      const isActiveWord = isSentActive && wordIdx === activeWordIndex;
                                      return (
                                        <span
                                          key={`${sentIdx}-${wordIdx}`}
                                          onClick={() => seekToTimestamp(word.start / 1000)}
                                          className="cursor-pointer hover:opacity-70"
                                          style={{
                                            textDecoration: isActiveWord ? 'underline' : 'none',
                                            textDecorationColor: isActiveWord ? 'hsl(var(--primary))' : 'transparent',
                                            textDecorationThickness: '2px',
                                            textUnderlineOffset: '3px',
                                          }}
                                        >
                                          {word.text}{' '}
                                        </span>
                                      );
                                    });
                                  }
                                  
                                  // Fallback to text rendering
                                  return (
                                    <span
                                      key={sentIdx}
                                      className={isHighlighted ? 'px-2 py-1 rounded-full' : ''}
                                      style={isHighlighted && highlightColor ? {
                                        backgroundColor: highlightColor + '30',
                                        display: 'inline',
                                      } : undefined}
                                    >
                                      {sent.text}{' '}
                                    </span>
                                  );
                                })}
                              </p>
                            );
                          })}
                        </div>
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

