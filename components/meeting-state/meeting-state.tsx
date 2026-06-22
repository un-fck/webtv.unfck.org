"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useLocale } from "next-intl";
import type {
  LanguageOption,
  TranscriptionPanelData,
} from "@/components/transcription-panel";

/**
 * State shared between the meeting page's chrome (VideoPageClient: language
 * switcher, topic sidebar, video player) and the transcript panel that lives
 * inside its Suspense slot. Moved into Context — not prop-drilled — because
 * the panel is now rendered by a server component sibling of VideoPageClient,
 * not its child, so callbacks/props can't reach across the boundary.
 *
 * State that's UI-local to a single component (video docking, back-link,
 * panel-internal stage/error/etc.) stays in that component's useState.
 */
interface PlayerHandle {
  currentTime: number;
  play: () => void;
}

interface MeetingState {
  /** Audio language the user is currently viewing. Defaults to URL locale. */
  selectedLanguage: string;
  setSelectedLanguage: Dispatch<SetStateAction<string>>;

  /** Language tracks the Kaltura entry exposes + their transcription status. */
  availableLanguages: LanguageOption[];
  setAvailableLanguages: Dispatch<SetStateAction<LanguageOption[]>>;

  /** Topic filter chip — null means "all topics". */
  selectedTopic: string | null;
  setSelectedTopic: Dispatch<SetStateAction<string | null>>;

  /** Collapsed/expanded state of the topic legend in the sidebar. */
  topicCollapsed: boolean;
  setTopicCollapsed: Dispatch<SetStateAction<boolean>>;

  /** Live snapshot of the panel's derived data (segments, topics, etc.) —
   *  the sidebar's speaker/topic widgets read from this. */
  panelData: TranscriptionPanelData | null;
  setPanelData: Dispatch<SetStateAction<TranscriptionPanelData | null>>;

  /** The Kaltura player handle, once ready. Used by the panel for seeks
   *  and by the playback-tracking hook for time-driven highlight. */
  player: PlayerHandle | undefined;
  setPlayer: Dispatch<SetStateAction<PlayerHandle | undefined>>;

  /** Refetch the available-languages list from /api/languages. The panel
   *  fires this after a successful transcribe POST so a brand-new track
   *  shows up in the chrome's language switcher without a page reload. */
  refreshLanguages: () => void;
}

const MeetingStateContext = createContext<MeetingState | null>(null);

export function useMeetingState(): MeetingState {
  const ctx = useContext(MeetingStateContext);
  if (!ctx) {
    throw new Error(
      "useMeetingState must be used within <MeetingStateProvider>",
    );
  }
  return ctx;
}

interface MeetingStateProviderProps {
  /** Kaltura entry id for the meeting. Stable for the lifetime of the page;
   *  the provider keeps it for refreshLanguages without re-reading from props. */
  kalturaId: string;
  children: ReactNode;
}

export function MeetingStateProvider({
  kalturaId,
  children,
}: MeetingStateProviderProps) {
  // Default to the URL locale — same language the user picked for the site
  // is the natural first guess for what they want to read/listen to. If the
  // chosen language isn't actually available for this meeting, a fallback
  // effect in VideoPageClient swaps it to floor / first-available.
  const uiLocale = useLocale();
  const [selectedLanguage, setSelectedLanguage] = useState<string>(uiLocale);
  const [availableLanguages, setAvailableLanguages] = useState<
    LanguageOption[]
  >([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [topicCollapsed, setTopicCollapsed] = useState(true);
  const [panelData, setPanelData] = useState<TranscriptionPanelData | null>(
    null,
  );
  const [player, setPlayer] = useState<PlayerHandle | undefined>();

  const refreshLanguages = useCallback(() => {
    fetch(`/api/languages?kalturaId=${encodeURIComponent(kalturaId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.languages) setAvailableLanguages(data.languages);
      })
      .catch(() => {
        // Best-effort — chrome retains the previous list on failure.
      });
  }, [kalturaId]);

  // Kick off the initial language fetch on mount. Effect runs once per
  // kalturaId, mirroring the previous behavior in VideoPageClient.
  useEffect(() => {
    refreshLanguages();
  }, [refreshLanguages]);

  // Once we know what's actually available for this meeting, validate that
  // `selectedLanguage` is one of the available codes. If not, fall back:
  //   UI locale → floor (original audio) → first available track.
  // Only fires when availableLanguages updates and the selection is invalid,
  // so a user's manual pick of an available language is never overridden.
  useEffect(() => {
    if (availableLanguages.length === 0) return;
    const currentIsAvailable = availableLanguages.some(
      (l) => l.code === selectedLanguage && l.available,
    );
    if (currentIsAvailable) return;
    const floor = availableLanguages.find(
      (l) => l.code === "floor" && l.available,
    );
    const firstAvailable = availableLanguages.find((l) => l.available);
    const fallback = floor?.code ?? firstAvailable?.code;
    if (fallback && fallback !== selectedLanguage) {
      setSelectedLanguage(fallback);
    }
  }, [availableLanguages, selectedLanguage]);

  const value = useMemo<MeetingState>(
    () => ({
      selectedLanguage,
      setSelectedLanguage,
      availableLanguages,
      setAvailableLanguages,
      selectedTopic,
      setSelectedTopic,
      topicCollapsed,
      setTopicCollapsed,
      panelData,
      setPanelData,
      player,
      setPlayer,
      refreshLanguages,
    }),
    [
      selectedLanguage,
      availableLanguages,
      selectedTopic,
      topicCollapsed,
      panelData,
      player,
      refreshLanguages,
    ],
  );

  return (
    <MeetingStateContext.Provider value={value}>
      {children}
    </MeetingStateContext.Provider>
  );
}
