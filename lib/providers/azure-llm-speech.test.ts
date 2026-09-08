import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  duration: 100,
  bytes: 5,
  split: vi.fn(),
  download: vi.fn(),
}));
vi.mock("child_process", () => {
  const execFile = () => {};
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: async (command: string, args: string[]) => {
      if (command === "ffmpeg") {
        fs.writeFileSync(args.at(-1)!, "audio");
        fs.truncateSync(args.at(-1)!, mocks.bytes);
      }
      return {
        stdout: command === "ffprobe" ? String(mocks.duration) : "",
        stderr: "",
      };
    },
  });
  return { execFile };
});
vi.mock("./utils", async (original) => {
  const actual = await original<typeof import("./utils")>();
  return {
    ...actual,
    splitAudioAsync: mocks.split,
    downloadAudioToTemp: mocks.download,
  };
});

let dir: string;
let input: string;
const fetchMock = vi.fn();
const response = (text = "Hello", speaker = 1) =>
  new Response(
    JSON.stringify({
      durationMilliseconds: 3_600_000,
      combinedPhrases: [{ text }],
      phrases: [
        {
          speaker,
          text,
          offsetMilliseconds: 100,
          durationMilliseconds: 500,
          words: [{ text, offsetMilliseconds: 120, durationMilliseconds: 300 }],
        },
      ],
    }),
  );

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("AZURE_SPEECH_ENDPOINT", "https://test.example");
  vi.stubGlobal("fetch", fetchMock);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-test-"));
  input = path.join(dir, "input.mp3");
  fs.writeFileSync(input, "input");
  mocks.duration = 100;
  mocks.bytes = 5;
  mocks.download.mockResolvedValue(input);
  mocks.split.mockImplementation(async () => {
    const chunkDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-test-chunks-"));
    return Array.from({ length: 5 }, (_, i) => {
      const file = path.join(chunkDir, `${i}.mp3`);
      fs.writeFileSync(file, "chunk");
      return { path: file, offsetMs: i * 3_600_000 };
    });
  });
  fetchMock.mockImplementation(async () => response());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Azure LLM Speech chunking", () => {
  it("leaves short files intact, pins locale and preserves caller-owned input", async () => {
    const { azureLlmSpeech } = await import("./azure-llm-speech");
    const result = await azureLlmSpeech.transcribe("unused", {
      audioFilePath: input,
      language: "en",
    });
    expect(mocks.split).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body.get("definition")).locales,
    ).toEqual(["en-US"]);
    expect(result.utterances[0].speaker).toBe("1");
    expect(result.durationMs).toBe(100_000);
    expect(fs.existsSync(input)).toBe(true);
  });

  it("splits at the strict five-hour boundary and restores phrase/word offsets with distinct speakers", async () => {
    mocks.duration = 18_000;
    const { azureLlmSpeech } = await import("./azure-llm-speech");
    const result = await azureLlmSpeech.transcribe("unused", {
      audioFilePath: input,
      language: "floor",
    });
    expect(mocks.split).toHaveBeenCalledWith(
      expect.any(String),
      3600,
      "azure-llm-chunks-",
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.utterances).toHaveLength(5);
    expect(result.utterances[1]).toMatchObject({
      speaker: "chunk2:1",
      start: 3_600_100,
      end: 3_600_600,
      words: [{ speaker: "chunk2:1", start: 3_600_120, end: 3_600_420 }],
    });
    expect(result.durationMs).toBe(18_000_000);
    expect(result.usage).toEqual({ audioSeconds: 18_000 });
    expect(result.raw).toMatchObject({ chunked: true, chunkCount: 5 });
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body.get("definition")).locales,
    ).toBeUndefined();
    const chunks = await mocks.split.mock.results[0].value;
    expect(fs.existsSync(path.dirname(chunks[0].path))).toBe(false);
  });

  it("splits at the strict 500 MB boundary even when duration is shorter", async () => {
    mocks.bytes = 500_000_000;
    const { azureLlmSpeech } = await import("./azure-llm-speech");
    await azureLlmSpeech.transcribe("unused", { audioFilePath: input });
    expect(mocks.split).toHaveBeenCalledTimes(1);
  });

  it("retries only the failing block", async () => {
    vi.useFakeTimers();
    mocks.duration = 18_001;
    fetchMock.mockResolvedValueOnce(new Response("busy", { status: 429 }));
    const { azureLlmSpeech } = await import("./azure-llm-speech");
    const result = azureLlmSpeech.transcribe("unused", {
      audioFilePath: input,
    });
    await vi.runAllTimersAsync();
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("waits for in-flight work before cleanup and stops scheduling after a permanent failure", async () => {
    mocks.duration = 18_001;
    let resolvePending!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      async () => new Response("invalid", { status: 422 }),
    );
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePending = resolve;
        }),
    );
    const { azureLlmSpeech } = await import("./azure-llm-speech");
    const pending = azureLlmSpeech.transcribe("unused");
    const rejected = expect(pending).rejects.toThrow("422");
    await vi.waitFor(() => expect(resolvePending).toBeDefined());
    const chunks = await mocks.split.mock.results[0].value;
    expect(fs.existsSync(chunks[1].path)).toBe(true);
    resolvePending(response());
    await rejected;
    expect(fetchMock.mock.calls.length).toBeLessThan(5);
    expect(fs.existsSync(path.dirname(chunks[0].path))).toBe(false);
    expect(fs.existsSync(input)).toBe(false);
  });
});
