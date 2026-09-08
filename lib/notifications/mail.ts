import { SITE_TITLE, deliver } from "@/lib/email/transport";
import { TRANSCRIPT_DISCLAIMER } from "@/lib/config";
import type { VideoRecord } from "@/lib/db";
import { getTrustedBaseUrl } from "@/lib/get-base-url";
import { videoUrl } from "@/lib/video-url";

/** Full URL (origin + path) for a video — used in transcript-ready emails. */
function videoFullUrl(
  video: Pick<VideoRecord, "pv_symbol" | "pv_part" | "asset_id">,
): string {
  return `${getTrustedBaseUrl()}/${videoUrl(video)}`;
}

/** Email a subscriber that a transcript they're waiting on is ready. */
export async function sendTranscriptReady(
  email: string,
  video: Pick<
    VideoRecord,
    "pv_symbol" | "pv_part" | "asset_id" | "title" | "clean_title"
  >,
  reason: "subscription" | "retranscription" = "subscription",
): Promise<void> {
  const link = videoFullUrl(video);
  const baseUrl = getTrustedBaseUrl();
  const title = video.clean_title || video.title || "A meeting you follow";

  const explanation =
    reason === "retranscription"
      ? "You are receiving this because you requested a fresh transcription."
      : "You are receiving this because you subscribed to transcript notifications.";

  await deliver({
    to: email,
    subject: `Transcript ready: ${title}`,
    text: `${SITE_TITLE}\n\nThe transcript for "${title}" is now available.\n\nRead it here: ${link}\n\n${TRANSCRIPT_DISCLAIMER}\n\n${explanation} Manage your subscriptions: ${baseUrl}/subscriptions`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" style="background:#fff;padding:32px 20px;"><tr><td align="center">
<table width="100%" style="max-width:520px;">
<tr><td style="padding:0 0 24px;"><div style="font-size:20px;font-weight:700;">${SITE_TITLE}</div></td></tr>
<tr><td style="border-top:1px solid #e5e7eb;padding:24px 0 0;"></td></tr>
<tr><td><p style="margin:0 0 16px;font-size:15px;color:#374151;">The transcript for <strong>${title}</strong> is now available.</p>
<a href="${link}" style="display:inline-block;background:#009edb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;">Read transcript</a>
<p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">Or copy: <a href="${link}" style="color:#009edb;word-break:break-all;">${link}</a></p>
</td></tr>
<tr><td style="padding:24px 0 0;"><p style="margin:0;font-size:12px;color:#9ca3af;">${TRANSCRIPT_DISCLAIMER}</p></td></tr>
<tr><td style="padding:12px 0 0;"><p style="margin:0;font-size:12px;color:#9ca3af;">${explanation} <a href="${baseUrl}/subscriptions" style="color:#9ca3af;">Manage subscriptions</a>.</p></td></tr>
</table></td></tr></table></body></html>`,
  });
}
