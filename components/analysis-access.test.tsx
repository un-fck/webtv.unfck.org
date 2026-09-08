import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import type { Video } from "@/lib/un-api";
import type { TranscriptPayload } from "@/lib/transcript-payload";
import { TranscriptionPanel } from "./transcription-panel";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams("view=analysis"),
}));
vi.mock("./meeting-state/meeting-state", () => {
  const state = {
    selectedLanguage: "en",
    availableLanguages: [],
    setPanelData: vi.fn(),
    selectedTopic: null,
  };
  return { useMeetingState: () => state };
});
vi.mock("./transcript-view", () => ({
  TranscriptView: () => <div>Public transcript content</div>,
}));
vi.mock("./analysis-view", () => ({
  AnalysisView: () => <div>Existing analysis content</div>,
}));

const initial: TranscriptPayload = {
  transcriptId: "t1",
  language: "en",
  analysisStatus: "none",
  flagged: false,
  sourceDurationMs: null,
  alignedDurationMs: null,
  pendingRetranscribeId: null,
  pendingRetranscribeStage: null,
  statements: [
    {
      start: 0,
      end: 1000,
      paragraphs: [
        {
          start: 0,
          end: 1000,
          sentences: [{ text: "Public transcript", start: 0, end: 1000 }],
        },
      ],
    },
  ],
  speakerMappings: {
    "0": { speaker_name: "Speaker", country: null, role: null },
  } as unknown as TranscriptPayload["speakerMappings"],
  topics: { topic: { key: "topic", label: "Topic", description: "Topic" } },
  propositions: [],
};
const video = {
  cleanTitle: "Meeting",
  date: "2026-09-08",
  slug: "sc/1",
  status: "finished",
} as Video;
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock
    .mockReset()
    .mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function panel(
  isLoggedIn: boolean,
  experimentalAccess: boolean,
  existing = false,
) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <TranscriptionPanel
        kalturaId="k1"
        video={video}
        isLoggedIn={isLoggedIn}
        experimentalAccess={experimentalAccess}
        initialTranscript={{
          ...initial,
          propositions: existing
            ? ([
                { key: "private" },
              ] as unknown as TranscriptPayload["propositions"])
            : [],
        }}
      />
    </NextIntlClientProvider>
  );
}

describe.each([
  ["anonymous", false, false],
  ["ordinary", true, false],
  ["experimental", true, true],
] as const)("%s viewer", (_name, loggedIn, access) => {
  it("gates the Analysis tab and Run Analysis even on a deep link", async () => {
    render(panel(loggedIn, access));
    if (access) {
      expect(screen.getByRole("tab", { name: "Analysis" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      fireEvent.click(screen.getByRole("button", { name: "Run Analysis" }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith("/api/transcripts/t1/analysis", {
          method: "POST",
        }),
      );
    } else {
      expect(
        screen.queryByRole("tab", { name: "Analysis" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Run Analysis" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Public transcript content")).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith("/analysis")),
      ).toBe(false);
    }
  });
  it("gates existing analysis results", () => {
    render(panel(loggedIn, access, true));
    expect(screen.queryByText("Existing analysis content") !== null).toBe(
      access,
    );
  });
});

it("falls back to Transcript if experimental access is removed", () => {
  const { rerender } = render(panel(true, true));
  expect(
    screen.getByRole("button", { name: "Run Analysis" }),
  ).toBeInTheDocument();
  rerender(panel(true, false));
  expect(
    screen.queryByRole("tab", { name: "Analysis" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Run Analysis" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Public transcript content")).toBeInTheDocument();
});
