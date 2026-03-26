import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

export async function POST(request: NextRequest) {
  try {
    const {
      entryId,
      flavorParamsId = 100,
      startTime,
      endTime,
    } = await request.json();

    if (!entryId) {
      return NextResponse.json({ error: "Entry ID required" }, { status: 400 });
    }

    console.log(
      `Downloading HLS for entry ${entryId}, time range: ${startTime}-${endTime}s`,
    );

    // Get HLS manifest URL
    const manifestUrl = `https://cdnapisec.kaltura.com/p/2503451/sp/0/playManifest/entryId/${entryId}/format/applehttp/protocol/https/flavorParamIds/${flavorParamsId}/a.m3u8`;

    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest: ${manifestRes.status}`);
    }

    const manifestText = await manifestRes.text();
    console.log("Got manifest, parsing...");

    // Parse manifest to get the audio stream URL
    const lines = manifestText.split("\n");
    let audioStreamUrl = "";

    const audioLines = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO"));

    if (audioLines.length) {
      const parsed = audioLines.map((line) => {
        const attrs = Object.fromEntries(
          Array.from(line.matchAll(/([A-Z-]+)="([^"]+)"/g)).map((match) => [
            match[1].toLowerCase(),
            match[2],
          ]),
        );
        return {
          uri: attrs.uri,
          lang: attrs.language?.toLowerCase(),
          isDefault: /DEFAULT=YES/.test(line),
        };
      });
      const preferred =
        parsed.find((item) => item.lang === "en") ||
        parsed.find((item) => item.isDefault) ||
        parsed[0];
      audioStreamUrl = preferred?.uri || "";
    }

    if (!audioStreamUrl) {
      for (const raw of lines) {
        const line = raw.trim();
        if (line && !line.startsWith("#") && line.includes(".m3u8")) {
          audioStreamUrl = line;
          break;
        }
      }
    }

    if (!audioStreamUrl) {
      throw new Error("Could not find audio stream in manifest");
    }

    console.log("Fetching audio playlist:", audioStreamUrl);

    // Fetch the audio stream playlist
    const playlistRes = await fetch(audioStreamUrl);
    if (!playlistRes.ok) {
      throw new Error(`Failed to fetch playlist: ${playlistRes.status}`);
    }

    const playlistText = await playlistRes.text();
    const playlistLines = playlistText.split("\n");

    // Parse segment URLs and durations
    const segments: { url: string; duration: number; startTime: number }[] = [];
    let currentTime = 0;

    for (let i = 0; i < playlistLines.length; i++) {
      const line = playlistLines[i].trim();

      if (line.startsWith("#EXTINF:")) {
        const duration = parseFloat(line.split(":")[1].split(",")[0]);
        const nextLine = playlistLines[i + 1]?.trim();

        if (nextLine && !nextLine.startsWith("#")) {
          // Resolve relative URL
          const segmentUrl = nextLine.startsWith("http")
            ? nextLine
            : new URL(nextLine, audioStreamUrl).toString();

          segments.push({
            url: segmentUrl,
            duration,
            startTime: currentTime,
          });

          currentTime += duration;
        }
      }
    }

    console.log(
      `Found ${segments.length} segments, total duration: ${currentTime}s`,
    );

    // Filter segments by time range if specified
    const filteredSegments = segments.filter((seg) => {
      if (startTime !== undefined && seg.startTime + seg.duration < startTime)
        return false;
      if (endTime !== undefined && seg.startTime > endTime) return false;
      return true;
    });

    console.log(
      `Downloading ${filteredSegments.length} segments in time range`,
    );

    // Download segments
    const segmentBuffers: Buffer[] = [];
    for (const segment of filteredSegments) {
      const segRes = await fetch(segment.url);
      if (!segRes.ok) {
        console.error(`Failed to download segment: ${segment.url}`);
        continue;
      }
      const buffer = Buffer.from(await segRes.arrayBuffer());
      segmentBuffers.push(buffer);
    }

    // Concatenate all segments
    const combinedBuffer = Buffer.concat(segmentBuffers);
    console.log(`Combined size: ${combinedBuffer.length} bytes`);

    // Save to temporary file
    const tmpFilename = `hls-${entryId}-${Date.now()}.ts`;
    const tmpPath = join("/tmp", tmpFilename);
    await writeFile(tmpPath, combinedBuffer);

    console.log(`Saved to: ${tmpPath}`);

    // Upload to AssemblyAI
    const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        Authorization: process.env.ASSEMBLYAI_API_KEY!,
      },
      body: combinedBuffer,
    });

    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      throw new Error(`Failed to upload to AssemblyAI: ${error}`);
    }

    const { upload_url } = await uploadRes.json();
    console.log("Uploaded to AssemblyAI:", upload_url);

    // Clean up temp file
    await unlink(tmpPath).catch((err) =>
      console.error("Failed to delete temp file:", err),
    );

    return NextResponse.json({
      upload_url,
      segmentCount: filteredSegments.length,
      totalDuration: currentTime,
    });
  } catch (error) {
    console.error("HLS download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
