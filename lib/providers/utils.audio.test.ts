import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fail: false, outputDir: "" }));
vi.mock("child_process", () => {
  const execFile = () => {};
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: async (_command: string, args: string[]) => {
      state.outputDir = path.dirname(args.at(-2)!);
      fs.writeFileSync(path.join(state.outputDir, "chunk_000.mp3"), "first");
      if (state.fail)
        throw Object.assign(new Error("decode failed"), {
          stderr: "Invalid data",
        });
      fs.writeFileSync(path.join(state.outputDir, "chunk_001.mp3"), "second");
      fs.writeFileSync(
        path.join(state.outputDir, "segments.csv"),
        "chunk_000.mp3,0.000000,3600.036000\nchunk_001.mp3,3600.036000,7200.000000\n",
      );
      return { stdout: "", stderr: "" };
    },
  });
  return { execFile };
});
import { splitAudioAsync } from "./utils";
const inputs: string[] = [];
function input() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-test-"));
  inputs.push(dir);
  const file = path.join(dir, 'audio "quoted".mp3');
  fs.writeFileSync(file, Buffer.alloc(2048));
  return file;
}
afterEach(() => {
  for (const dir of inputs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
  if (state.outputDir)
    fs.rmSync(state.outputDir, { recursive: true, force: true });
  state.fail = false;
});
it("returns ordered chunks with offsets and accepts paths containing quotes", async () => {
  const chunks = await splitAudioAsync(input(), 3600);
  expect(chunks.map((chunk) => chunk.offsetMs)).toEqual([0, 3_600_036]);
  expect(chunks.map((chunk) => fs.readFileSync(chunk.path, "utf8"))).toEqual([
    "first",
    "second",
  ]);
});
it("removes partially generated output on ffmpeg failure", async () => {
  state.fail = true;
  await expect(splitAudioAsync(input(), 3600)).rejects.toThrow("Invalid data");
  expect(fs.existsSync(state.outputDir)).toBe(false);
});
