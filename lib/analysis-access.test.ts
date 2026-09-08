import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AuthUser } from "./auth/service";
import type { Transcript } from "./db";

vi.mock("./auth/service", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./db", () => ({
  getTranscriptById: vi.fn(),
  getTranscriptByKalturaId: vi.fn(),
  getActiveTranscriptByKalturaId: vi.fn(),
  getPendingTranscriptByKalturaId: vi.fn(),
  getSpeakerMapping: vi.fn().mockResolvedValue({}),
  isTranscriptFlagged: vi.fn().mockReturnValue(false),
  claimAnalysis: vi.fn().mockResolvedValue(true),
  releaseAnalysis: vi.fn(),
  updateTranscriptContent: vi.fn(),
}));
vi.mock("./speakers", () => ({ getSpeakerMapping: vi.fn() }));
vi.mock("./transcription", () => ({
  pollTranscription: vi.fn(),
  submitTranscription: vi.fn(),
}));
vi.mock("./pipeline", () => ({ analyzePropositions: vi.fn() }));
vi.mock("openai", () => ({ AzureOpenAI: class {} }));
vi.mock("./worker-identity", () => ({ currentWorkerId: () => "test-worker" }));
vi.mock("./rate-limit", () => ({
  enforceUserDailyLimit: vi.fn(),
  enforceGlobalDailyLimit: vi.fn(),
}));

import { getCurrentUser } from "./auth/service";
import {
  getTranscriptById,
  getTranscriptByKalturaId,
  getActiveTranscriptByKalturaId,
  claimAnalysis,
} from "./db";
import { getSpeakerMapping } from "./speakers";
import { pollTranscription } from "./transcription";
import { analyzePropositions } from "./pipeline";
import { buildTranscriptPayload } from "./transcript-payload";
import { GET as poll } from "@/app/api/transcripts/[id]/route";
import { GET as check } from "@/app/api/transcripts/check/route";
import { POST as cachedPost } from "@/app/api/transcripts/route";
import { POST as runAnalysis } from "@/app/api/transcripts/[id]/analysis/route";

const propositions = [{ key: "private-analysis" }];
const transcript = {
  transcript_id: "t1",
  kaltura_id: "k1",
  language_code: "en",
  transcription_status: "completed",
  analysis_status: "completed",
  content: {
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
    raw_paragraphs: [{ text: "Public transcript" }],
    propositions,
  },
} as unknown as Transcript;
const context = { params: Promise.resolve({ id: "t1" }) };
const accounts: [string, AuthUser | null][] = [
  ["anonymous", null],
  [
    "ordinary",
    {
      id: "u1",
      email: "ordinary@example.org",
      experimentalAccess: false,
      experimentalWaitlistAt: null,
    },
  ],
  [
    "experimental",
    {
      id: "u2",
      email: "experimental@example.org",
      experimentalAccess: true,
      experimentalWaitlistAt: null,
    },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranscriptById).mockResolvedValue(transcript);
  vi.mocked(getTranscriptByKalturaId).mockResolvedValue(transcript);
  vi.mocked(getActiveTranscriptByKalturaId).mockResolvedValue(transcript);
  vi.mocked(getSpeakerMapping).mockResolvedValue({
    s1: { name: "Speaker" },
  } as never);
  vi.mocked(pollTranscription).mockImplementation(async () => ({
    stage: "completed",
    statements: transcript.content.statements,
    propositions: transcript.content.propositions,
  }));
  vi.mocked(analyzePropositions).mockResolvedValue(
    transcript.content.propositions!,
  );
});

describe.each(accounts)("analysis access: %s", (_name, user) => {
  beforeEach(() => vi.mocked(getCurrentUser).mockResolvedValue(user));
  const allowed = !!user?.experimentalAccess;
  it("filters the shared SSR payload", async () => {
    const result = await buildTranscriptPayload(transcript, {
      experimentalAccess: allowed,
    });
    expect(result.propositions).toEqual(allowed ? propositions : []);
    expect(result.statements).toHaveLength(1);
  });
  it.each(["check", "cached POST", "poll"])(
    "filters %s responses while retaining public transcripts",
    async (route) => {
      const response =
        route === "check"
          ? await check(
              new NextRequest(
                "http://localhost/api/transcripts/check?kalturaId=k1",
              ),
            )
          : route === "cached POST"
            ? await cachedPost(
                new NextRequest("http://localhost/api/transcripts", {
                  method: "POST",
                  body: JSON.stringify({ kalturaId: "k1" }),
                }),
              )
            : await poll(
                new NextRequest("http://localhost/api/transcripts/t1"),
                context,
              );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.propositions).toEqual(allowed ? propositions : []);
      expect(body.statements).toHaveLength(1);
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("vary")).toContain("Cookie");
    },
  );
  it("authorizes execution before starting paid work", async () => {
    const response = await runAnalysis(
      new NextRequest("http://localhost/api/transcripts/t1/analysis", {
        method: "POST",
      }),
      context,
    );
    expect(response.status).toBe(allowed ? 200 : user ? 403 : 401);
    expect(claimAnalysis).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(analyzePropositions).toHaveBeenCalledTimes(allowed ? 1 : 0);
    expect(getTranscriptById).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });
});

it("does not reuse an authorized polling body after access is revoked", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(accounts[2][1]);
  const authorized = await poll(
    new NextRequest("http://localhost/api/transcripts/t1"),
    context,
  );
  vi.mocked(getCurrentUser).mockResolvedValue(accounts[1][1]);
  const denied = await poll(
    new NextRequest("http://localhost/api/transcripts/t1", {
      headers: { "if-none-match": authorized.headers.get("etag")! },
    }),
    context,
  );
  expect(denied.status).toBe(200);
  expect((await denied.json()).propositions).toEqual([]);
  const unchanged = await poll(
    new NextRequest("http://localhost/api/transcripts/t1", {
      headers: { "if-none-match": denied.headers.get("etag")! },
    }),
    context,
  );
  expect(unchanged.status).toBe(304);
  expect(unchanged.headers.get("cache-control")).toContain("private");
  expect(unchanged.headers.get("vary")).toContain("Cookie");
});
