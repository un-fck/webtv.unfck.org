'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SpeakerMapping } from '@/lib/speakers';
import type { Video, VideoMetadata } from '@/lib/un-api';
import { getCountryName } from '@/lib/country-lookup';
import { ChevronDown, FoldVertical, UnfoldVertical, Check, RotateCcw } from 'lucide-react';
import ExcelJS from 'exceljs';

type Stage = 'idle' | 'transcribing' | 'transcribed' | 'identifying_speakers' | 'analyzing_topics' | 'completed' | 'error';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'transcribing', label: 'Transcribing audio' },
  { key: 'identifying_speakers', label: 'Identifying speakers' },
  { key: 'analyzing_topics', label: 'Analyzing topics' },
];

function getStageIndex(stage: Stage): number {
  if (stage === 'transcribed') return 0; // Just finished transcribing
  return STAGES.findIndex(s => s.key === stage);
}

function StageProgress({ currentStage, errorMessage, onRetry }: { currentStage: Stage; errorMessage?: string; onRetry?: () => void }) {
  const currentIndex = currentStage === 'completed' ? STAGES.length : getStageIndex(currentStage);
  
  return (
    <div className="space-y-2 mb-4">
      {STAGES.map((stage, idx) => {
        const isDone = currentStage === 'completed' || idx < currentIndex;
        const isActive = idx === currentIndex && currentStage !== 'completed' && currentStage !== 'error';
        const isError = currentStage === 'error' && idx === currentIndex;
        
        return (
          <div key={stage.key} className="flex items-center gap-2 text-sm">
            {isDone ? (
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            ) : isActive ? (
              <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              </div>
            ) : isError ? (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs">!</span>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
            )}
            <span className={`${isDone ? 'text-foreground' : isActive ? 'text-foreground font-medium' : isError ? 'text-red-600' : 'text-muted-foreground'}`}>
              {stage.label}
              {isActive && <span className="ml-2 text-muted-foreground">...</span>}
            </span>
          </div>
        );
      })}
      {currentStage === 'error' && errorMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center justify-between">
          <span>{errorMessage}</span>
          {onRetry && (
            <button onClick={onRetry} className="flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 rounded text-xs">
              <RotateCcw className="w-3 h-3" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface RawParagraph {
  text: string;
  start: number;
  end: number;
  words: Array<{ text: string; start: number; end: number; speaker?: string }>;
}

const TOPIC_COLOR_PALETTE = [
  '#5b8dc9', '#5eb87d', '#9b7ac9', '#e67c5a', '#4db8d4',
  '#d4a834', '#7aad6f', '#d46ba3', '#5aa7d4', '#c98d4d',
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
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [showCopied, setShowCopied] = useState(false);
  const [speakerMappings, setSpeakerMappings] = useState<SpeakerMapping>({});
  const [countryNames, setCountryNames] = useState<Map<string, string>>(new Map());
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [topics, setTopics] = useState<Record<string, { key: string; label: string; description: string }>>({});
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [rawParagraphs, setRawParagraphs] = useState<RawParagraph[] | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicCollapsed, setTopicCollapsed] = useState<boolean>(true);
  const [activeStatementIndex, setActiveStatementIndex] = useState<number>(-1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(-1);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const downloadButtonRef = useRef<HTMLDivElement>(null);
  
  const isLoading = stage !== 'idle' && stage !== 'completed' && stage !== 'error';

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
    setStage('transcribing');
    setErrorMessage(null);
    
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
      setTranscriptId(data.transcriptId);
      
      // If we got statements directly (cached/completed), use them
      if (data.statements && data.statements.length > 0) {
        setStatements(data.statements);
        if (data.topics) setTopics(data.topics);
        if (data.speakerMappings) {
          setSpeakerMappings(data.speakerMappings);
          await loadCountryNames(data.speakerMappings);
        }
        setStage('completed');
        return;
      }
      
      // Set initial stage and raw paragraphs if available
      if (data.stage) setStage(data.stage);
      if (data.raw_paragraphs) setRawParagraphs(data.raw_paragraphs);
      
      // Start polling
      if (data.transcriptId) {
        await pollForCompletion(data.transcriptId);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to transcribe');
      setStage('error');
    }
  };
  
  const pollForCompletion = async (tid: string) => {
    let pollCount = 0;
    const maxTranscriptionPolls = 200; // ~10 min for AssemblyAI
    
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      pollCount++;
      
      const pollResponse = await fetch('/api/transcribe/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptId: tid }),
      });
      
      if (!pollResponse.ok) throw new Error('Failed to poll transcript status');
      
      const data = await pollResponse.json();
      
      // Update stage
      if (data.stage) setStage(data.stage);
      
      // Update raw paragraphs as soon as available
      if (data.raw_paragraphs && !rawParagraphs) {
        setRawParagraphs(data.raw_paragraphs);
      }
      
      // Update statements when available (even before topics)
      if (data.statements?.length > 0) {
        setStatements(data.statements);
        if (data.speakerMappings && Object.keys(data.speakerMappings).length > 0) {
          setSpeakerMappings(data.speakerMappings);
          await loadCountryNames(data.speakerMappings);
        }
      }
      
      // Update topics when available
      if (data.topics && Object.keys(data.topics).length > 0) {
        setTopics(data.topics);
      }
      
      // Check for completion or error
      if (data.stage === 'completed') {
        break;
      } else if (data.stage === 'error') {
        throw new Error(data.error_message || 'Pipeline failed');
      } else if (data.stage === 'transcribing' && pollCount >= maxTranscriptionPolls) {
        throw new Error('Transcription timeout - audio processing took too long');
      }
    }
  };
  
  const handleRetry = () => {
    if (transcriptId) {
      // Retry from where we left off
      setStage('transcribing');
      setErrorMessage(null);
      pollForCompletion(transcriptId).catch(err => {
        setErrorMessage(err instanceof Error ? err.message : 'Retry failed');
        setStage('error');
      });
    } else {
      handleTranscribe(true);
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
          
          // Store transcript ID for potential retry
          if (data.transcriptId) setTranscriptId(data.transcriptId);
          
          // Load cached transcript if completed
          if (data.statements && data.statements.length > 0) {
            setStatements(data.statements);
            if (data.topics) setTopics(data.topics);
            if (data.speakerMappings) {
              setSpeakerMappings(data.speakerMappings);
              await loadCountryNames(data.speakerMappings);
            }
            setStage('completed');
          } else if (data.raw_paragraphs) {
            // Have raw data but pipeline not complete - show intermediate and poll
            setRawParagraphs(data.raw_paragraphs);
            if (data.stage) setStage(data.stage);
            if (data.transcriptId) {
              pollForCompletion(data.transcriptId).catch(err => {
                setErrorMessage(err instanceof Error ? err.message : 'Pipeline failed');
                setStage('error');
              });
            }
          }
        }
      } catch (err) {
        console.log('Cache check failed:', err);
      } finally {
        setChecking(false);
      }
    };

    checkCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const lastScrolledKey = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (activeStatementIndex < 0 || activeParagraphIndex < 0) return;
    
    const key = `${activeStatementIndex}-${activeParagraphIndex}`;
    
    // Don't scroll if we already scrolled to this paragraph
    if (lastScrolledKey.current === key) return;
    
    const element = document.querySelector<HTMLElement>(`[data-paragraph-key="${key}"]`);
    if (!element) return;
    
    const scrollContainer = element.closest('.overflow-y-auto');
    if (!scrollContainer) return;
    
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const elementTopInContainer = elementRect.top - containerRect.top + scrollContainer.scrollTop;
    const containerHeight = scrollContainer.clientHeight;
    
    // Detect if user jumped (time changed by > 5 seconds in one update)
    const timeDelta = Math.abs(currentTime - lastTimeRef.current);
    const isJump = timeDelta > 5;
    lastTimeRef.current = currentTime;
    
    // For jumps: always scroll. For normal playback: only if roughly in view
    const relativeTop = elementRect.top - containerRect.top;
    const isRoughlyInView = relativeTop > -containerHeight * 1.5 && relativeTop < containerHeight * 2.5;
    
    if (isJump || isRoughlyInView) {
      const offset = containerHeight / 3;
      const targetScroll = elementTopInContainer - offset;
      scrollContainer.scrollTo({ top: targetScroll, behavior: isJump ? 'instant' : 'smooth' });
      lastScrolledKey.current = key;
    }
  }, [activeStatementIndex, activeParagraphIndex, currentTime]);


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
          {!segments && !rawParagraphs && !checking && stage === 'idle' && (
            <button
              onClick={() => handleTranscribe()}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90"
            >
              Generate
            </button>
          )}
          {(segments || rawParagraphs) && (
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
      
      {checking && stage === 'idle' && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Checking for existing transcript...</span>
        </div>
      )}
      
      {isLoading && (
        <StageProgress currentStage={stage} />
      )}
      
      {stage === 'error' && (
        <StageProgress currentStage={stage} errorMessage={errorMessage || undefined} onRetry={handleRetry} />
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
      
      {/* Show raw paragraphs while waiting for speaker identification */}
      {!segments && rawParagraphs && rawParagraphs.length > 0 && (
        <div className="space-y-3">
          {rawParagraphs.map((para, idx) => {
            // Group consecutive paragraphs by speaker
            const speaker = para.words[0]?.speaker || 'A';
            const prevSpeaker = idx > 0 ? (rawParagraphs[idx - 1].words[0]?.speaker || 'A') : null;
            const showHeader = speaker !== prevSpeaker;
            
            return (
              <div key={idx}>
                {showHeader && (
                  <div className="text-sm font-semibold tracking-wide text-foreground mb-2 pt-3">
                    Speaker {speaker}
                    <button
                      onClick={() => seekToTimestamp(para.start / 1000)}
                      className="ml-2 text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      [{formatTime(para.start / 1000)}]
                    </button>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-muted/50 text-sm leading-relaxed">
                  {para.words.map((word, wIdx) => (
                    <span
                      key={wIdx}
                      onClick={() => seekToTimestamp(word.start / 1000)}
                      className="cursor-pointer hover:opacity-70"
                    >
                      {word.text}{' '}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {!segments && !rawParagraphs && stage === 'idle' && !checking && (
        <p className="text-muted-foreground text-sm">
          Click &quot;Generate&quot; to create a text transcript of this video using AI.
        </p>
      )}
    </div>
  );
}

