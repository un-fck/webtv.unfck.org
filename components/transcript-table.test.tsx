import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import { VideoTable } from "@/components/transcript-table";
import type { Video } from "@/lib/un-api";

// next/navigation is unavailable outside the Next runtime — stub the hooks the
// table reads.
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

interface VideoFixture {
  id: string;
  title: string;
  category: string;
  date: string;
  duration: string;
  scheduledTime: string | null;
  expected: {
    eventCode: string | null;
    eventType: string | null;
    body: string | null;
    sessionNumber: string | null;
    partNumber: number | null;
    cleanTitle: string;
    pvSymbol: string | null;
  };
}

const fixtures: VideoFixture[] = JSON.parse(
  readFileSync(
    join(__dirname, "..", "lib", "__fixtures__", "videos.sample.json"),
    "utf8",
  ),
);

// Build real Video rows from the captured fixtures.
const videos: Video[] = fixtures.slice(0, 6).map((fx) => ({
  id: fx.id,
  url: `https://webtv.un.org/en/asset/${fx.id}`,
  title: fx.title,
  cleanTitle: fx.expected.cleanTitle,
  category: fx.category,
  duration: fx.duration,
  date: fx.date,
  scheduledTime: fx.scheduledTime,
  status: "finished",
  eventCode: fx.expected.eventCode,
  eventType: fx.expected.eventType,
  body: fx.expected.body,
  sessionNumber: fx.expected.sessionNumber,
  partNumber: fx.expected.partNumber,
  pvSymbol: fx.expected.pvSymbol,
  pvAvailable: false,
  slug: fx.expected.pvSymbol ? "x" : `meeting/${fx.id}`,
  hasTranscript: false,
}));

function renderTable() {
  return render(
    <VideoTable
      videos={videos}
      totalCount={videos.length}
      serverParams={{ page: 1, pageSize: 50, status: "past" }}
      availableDates={[...new Set(videos.map((v) => v.date))]}
      filterOptions={{
        bodies: [
          ...new Set(videos.map((v) => v.body).filter(Boolean)),
        ] as string[],
        categories: [...new Set(videos.map((v) => v.category))],
        bodyCounts: {},
        categoryCounts: {},
      }}
    />,
  );
}

describe("VideoTable (real fixture rows)", () => {
  it("renders a row for each video with its clean title", () => {
    renderTable();
    for (const v of videos) {
      // Titles can appear in both desktop and mobile layouts.
      expect(screen.getAllByText(v.cleanTitle).length).toBeGreaterThan(0);
    }
  });

  it("renders meeting links derived from the slug", () => {
    const { container } = renderTable();
    const links = container.querySelectorAll('a[href^="/"]');
    expect(links.length).toBeGreaterThan(0);
  });
});
