import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { VideoTable } from "@/components/transcript-table";
import type { Video } from "@/lib/un-api";

const messages = JSON.parse(
  readFileSync(join(__dirname, "..", "messages", "en.json"), "utf8"),
);

// next/navigation is unavailable outside the Next runtime — stub the hooks the
// table reads. next-intl also pulls in `redirect` / `permanentRedirect` at
// module load, so spread the real module and override only the hooks.
const push = vi.fn();
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

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
  pvSymbol: fx.expected.pvSymbol,
  pvPart: fx.expected.pvSymbol ? 1 : null,
  pvAvailable: false,
  slug: fx.expected.pvSymbol ? "x" : `asset/${fx.id}`,
  hasTranscript: false,
  hasTranscriptInLocale: false,
  removed: false,
  i18n: {},
}));

function renderTable() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="UTC"
      now={new Date("2026-01-01T00:00:00Z")}
    >
      <VideoTable
        videos={videos}
        totalCount={videos.length}
        totalCountIncludingOther={videos.length}
        serverParams={{ page: 1, pageSize: 50 }}
        availableDates={[...new Set(videos.map((v) => v.date))]}
        filterOptions={{
          categories: [...new Set(videos.map((v) => v.category))],
          categoryCounts: {},
        }}
      />
    </NextIntlClientProvider>,
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

  it("merges rows with the same displayed day when DB dates are non-contiguous", () => {
    const base = videos[0];
    const crossingRows: Video[] = [
      {
        ...base,
        id: "monday-later",
        slug: "asset/monday-later",
        cleanTitle: "Monday later",
        date: "2026-08-17",
        scheduledTime: "2026-08-17T05:15:00.000Z",
      },
      {
        ...base,
        id: "sunday",
        slug: "asset/sunday",
        cleanTitle: "Sunday meeting",
        date: "2026-08-16",
        scheduledTime: "2026-08-16T12:00:00.000Z",
      },
      {
        ...base,
        id: "monday-midnight",
        slug: "asset/monday-midnight",
        cleanTitle: "Monday midnight",
        // This is the production edge case: the scraper's date bucket and
        // the user-visible day derived from scheduledTime disagree.
        date: "2026-08-16",
        scheduledTime: "2026-08-17T04:30:00.000Z",
      },
    ];

    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="UTC"
        now={new Date("2026-08-21T12:00:00Z")}
      >
        <VideoTable
          videos={crossingRows}
          totalCount={crossingRows.length}
          totalCountIncludingOther={crossingRows.length}
          serverParams={{ page: 1, pageSize: 50 }}
          availableDates={["2026-08-17", "2026-08-16"]}
          filterOptions={{ categories: [base.category], categoryCounts: {} }}
        />
      </NextIntlClientProvider>,
    );

    const mondayHeadings = screen.getAllByRole("heading", {
      name: /Monday, 17 August/,
    });
    expect(mondayHeadings).toHaveLength(1);

    const mondaySection = mondayHeadings[0].parentElement!;
    const mondayLinks = within(mondaySection)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(mondayLinks).toEqual(["Monday midnight", "Monday later"]);
  });
});
