import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({
  getVideoByKalturaId: vi.fn(),
  getVideoSubscribers: vi.fn(),
  getFeedSubscribers: vi.fn(),
  getRetranscriptionRequester: vi.fn(),
  getAllFeeds: vi.fn(),
  getTranscriptById: vi.fn(),
  claimTranscriptNotification: vi.fn(),
}));
vi.mock("@/lib/feeds", () => ({ matchFeeds: vi.fn(() => ["un80"]) }));
vi.mock("@/lib/notifications/mail", () => ({ sendTranscriptReady: vi.fn() }));
import * as db from "@/lib/db";
import { sendTranscriptReady } from "./mail";
import { notifyTranscriptSubscribers } from "./notify";
const transcript = {
  transcript_id: "replacement",
  kaltura_id: "meeting",
  language_code: "en",
};
const requester = { user_id: "requester", email: "requester@example.test" };
const subscriber = { user_id: "subscriber", email: "subscriber@example.test" };
const video = { title: "UN80 meeting" } as Awaited<
  ReturnType<typeof db.getVideoByKalturaId>
>;
describe("notification recipient selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getVideoByKalturaId).mockResolvedValue(video);
    vi.mocked(db.getVideoSubscribers).mockResolvedValue([]);
    vi.mocked(db.getFeedSubscribers).mockResolvedValue([]);
    vi.mocked(db.getAllFeeds).mockResolvedValue([]);
    vi.mocked(db.getRetranscriptionRequester).mockResolvedValue(null);
    vi.mocked(db.claimTranscriptNotification).mockResolvedValue(true);
  });
  it("notifies an unsubscribed replacement requester", async () => {
    vi.mocked(db.getRetranscriptionRequester).mockResolvedValue(requester);
    expect((await notifyTranscriptSubscribers(transcript)).sent).toBe(1);
    expect(sendTranscriptReady).toHaveBeenCalledWith(
      requester.email,
      video,
      "retranscription",
    );
  });
  it("sends once when requester also belongs to both subscriber lists", async () => {
    vi.mocked(db.getRetranscriptionRequester).mockResolvedValue(requester);
    vi.mocked(db.getVideoSubscribers).mockResolvedValue([requester]);
    vi.mocked(db.getFeedSubscribers).mockResolvedValue([requester]);
    await notifyTranscriptSubscribers(transcript);
    expect(sendTranscriptReady).toHaveBeenCalledTimes(1);
  });
  it("skips previously notified subscribers while notifying the requester", async () => {
    vi.mocked(db.getRetranscriptionRequester).mockResolvedValue(requester);
    vi.mocked(db.getFeedSubscribers).mockResolvedValue([subscriber]);
    vi.mocked(db.claimTranscriptNotification).mockImplementation(
      async (userId) => userId === requester.user_id,
    );
    await notifyTranscriptSubscribers(transcript);
    expect(sendTranscriptReady).toHaveBeenCalledTimes(1);
    expect(sendTranscriptReady).toHaveBeenCalledWith(
      requester.email,
      video,
      "retranscription",
    );
  });
  it("preserves first-time subscriber notifications", async () => {
    vi.mocked(db.getFeedSubscribers).mockResolvedValue([subscriber]);
    await notifyTranscriptSubscribers(transcript);
    expect(sendTranscriptReady).toHaveBeenCalledWith(
      subscriber.email,
      video,
      "subscription",
    );
  });
});
