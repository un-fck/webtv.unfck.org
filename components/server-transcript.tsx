import { getActiveTranscriptByKalturaId, type VideoRecord } from "@/lib/db";
import { getSpeakerMapping } from "@/lib/speakers";
import { stripWordsFromStatements } from "@/lib/strip-words";
import type { Video } from "@/lib/un-api";
import {
  TranscriptionPanel,
  type InitialTranscript,
} from "@/components/transcription-panel";

/**
 * Server async component that resolves the transcript for the URL locale
 * and renders <TranscriptionPanel> with it pre-populated.
 *
 * Sitting inside a <Suspense> boundary in video-page.tsx, this is what
 * makes streaming SSR pay off: the shell (header, player, sidebar) flushes
 * to the browser at ~TTFB while this component is still awaiting the DB
 * query; when the query resolves, the resolved markup arrives as a late
 * chunk and React swaps the skeleton for the real transcript.
 *
 * Word-level timestamps are stripped before sending (63% of the payload)
 * — the panel fetches them lazily via /api/transcripts/[id]/words once
 * the transcript is on screen.
 */
export async function ServerTranscript({
  kalturaId,
  locale,
  isLoggedIn,
  video,
  record,
}: {
  kalturaId: string;
  locale: string;
  isLoggedIn: boolean;
  video: Video;
  record: VideoRecord;
}) {
  const initialTranscript = await loadInitialTranscript({
    kalturaId,
    locale,
    isLoggedIn,
  });

  return (
    <TranscriptionPanel
      kalturaId={kalturaId}
      video={video}
      isLoggedIn={isLoggedIn}
      pvSymbol={
        video.pvAvailable && video.pvSymbol ? video.pvSymbol : undefined
      }
      initialTranscript={initialTranscript}
      // record is consumed inside the panel via context already; declared
      // here only to keep the call sites symmetrical with what video-page.tsx
      // resolved when picking the URL.
      key={record.asset_id}
    />
  );
}

async function loadInitialTranscript({
  kalturaId,
  locale,
  isLoggedIn,
}: {
  kalturaId: string;
  locale: string;
  isLoggedIn: boolean;
}): Promise<InitialTranscript | null> {
  const transcript = await getActiveTranscriptByKalturaId(kalturaId, locale);
  if (
    !transcript ||
    transcript.transcription_status !== "completed" ||
    !transcript.content.statements?.length
  ) {
    return null;
  }
  const speakerMappings =
    (await getSpeakerMapping(transcript.transcript_id)) || {};
  return {
    statements: stripWordsFromStatements(transcript.content.statements),
    speakerMappings,
    topics: transcript.content.topics || {},
    // Propositions are gated on login in /api/transcripts/check — mirror
    // that here so signed-out viewers don't see private analysis in the SSR
    // payload (and anonymous Bing/Copilot snippet pipelines never see it).
    propositions: isLoggedIn ? transcript.content.propositions || [] : [],
    transcriptId: transcript.transcript_id,
    language: transcript.language_code ?? locale,
    analysisStatus: transcript.analysis_status,
  };
}
