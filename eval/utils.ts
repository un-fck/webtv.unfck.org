import fs from "fs";
import os from "os";
import path from "path";

/** Download audio from a URL to a temp file. Returns the temp file path. */
export async function downloadAudioToTemp(
  audioUrl: string,
  label = "",
): Promise<string> {
  const tag = label ? `[${label}] ` : "";
  console.log(`  ${tag}Downloading audio...`);
  const res = await fetch(audioUrl, { redirect: "follow" });
  if (!res.ok)
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `eval-audio-${Date.now()}.mp4`);
  fs.writeFileSync(tmpPath, buffer);
  console.log(
    `  ${tag}Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
  );
  return tmpPath;
}

/** Format milliseconds as HH:MM:SS */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
