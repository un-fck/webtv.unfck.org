'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TimelineChart } from './tracker-timeline-chart';
import { CountryChart } from './tracker-country-chart';
import { Heatmap } from './tracker-heatmap';
import type {
  TrackedItem,
  SentimentTimelinePoint,
  CountrySentimentRow,
  SentimentHeatmapCell,
  SentimentObservation,
} from '@/lib/sentiment-types';

type Tab = 'timeline' | 'countries' | 'heatmap' | 'evidence';

const STANCE_COLORS: Record<string, string> = {
  support: '#16a34a',
  oppose: '#dc2626',
  conditional: '#eab308',
  neutral: '#6b7280',
};

interface TrackerItemDetailProps {
  item: TrackedItem;
}

export function TrackerItemDetail({ item }: TrackerItemDetailProps) {
  const [tab, setTab] = useState<Tab>('timeline');
  const [timeline, setTimeline] = useState<SentimentTimelinePoint[]>([]);
  const [countries, setCountries] = useState<CountrySentimentRow[]>([]);
  const [heatmap, setHeatmap] = useState<SentimentHeatmapCell[]>([]);
  const [observations, setObservations] = useState<SentimentObservation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [timelineRes, countriesRes, heatmapRes] = await Promise.all([
        fetch(`/api/tracker/items/${item.id}/timeline`),
        fetch(`/api/tracker/items/${item.id}/countries`),
        fetch(`/api/tracker/items/${item.id}/heatmap`),
      ]);
      if (timelineRes.ok) setTimeline(await timelineRes.json());
      if (countriesRes.ok) setCountries(await countriesRes.json());
      if (heatmapRes.ok) setHeatmap(await heatmapRes.json());
    } catch {
      console.error('Failed to fetch sentiment data');
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch observations lazily when evidence tab is selected
  useEffect(() => {
    if (tab !== 'evidence' || observations.length > 0) return;
    (async () => {
      try {
        // We'll build observations from the timeline + heatmap data for now
        // The full observations endpoint can be added later
        // For now, show what we have from the other endpoints
      } catch {
        // ignore
      }
    })();
  }, [tab, observations.length]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'timeline', label: 'Timeline' },
    { key: 'countries', label: 'Countries' },
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'evidence', label: 'Evidence' },
  ];

  const TYPE_LABELS: Record<string, string> = {
    topic: 'Topic',
    resolution_article: 'Resolution Article',
    proposal: 'Proposal',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/tracker" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block">
          &larr; Back to Tracker
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent text-accent-foreground">
            {TYPE_LABELS[item.type]}
          </span>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{item.description}</p>
        {item.reference_document && (
          <p className="text-xs text-muted-foreground mt-1">Document: {item.reference_document}</p>
        )}
        {item.matching_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.matching_keywords.map(kw => (
              <span key={kw} className="px-1.5 py-0.5 bg-accent text-accent-foreground rounded text-[10px]">{kw}</span>
            ))}
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Meetings</div>
          <div className="text-2xl font-semibold">{timeline.length}</div>
        </div>
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Countries</div>
          <div className="text-2xl font-semibold">{countries.length}</div>
        </div>
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Avg Sentiment</div>
          <div className="text-2xl font-semibold font-mono">
            {timeline.length > 0
              ? (timeline.reduce((s, t) => s + t.avg_overall, 0) / timeline.length).toFixed(2)
              : '—'}
          </div>
        </div>
        <div className="p-3 rounded-lg border border-border">
          <div className="text-xs text-muted-foreground">Total Observations</div>
          <div className="text-2xl font-semibold">
            {timeline.reduce((s, t) => s + t.observation_count, 0)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Loading sentiment data...</div>
      ) : (
        <div>
          {tab === 'timeline' && <TimelineChart data={timeline} />}
          {tab === 'countries' && <CountryChart data={countries} />}
          {tab === 'heatmap' && <Heatmap data={heatmap} />}
          {tab === 'evidence' && <EvidenceTab timeline={timeline} countries={countries} />}
        </div>
      )}
    </div>
  );
}

function EvidenceTab({
  timeline,
  countries,
}: {
  timeline: SentimentTimelinePoint[];
  countries: CountrySentimentRow[];
}) {
  if (timeline.length === 0) {
    return <div className="text-muted-foreground text-sm py-8 text-center">No evidence data yet.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Meeting-by-meeting breakdown */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Meeting History</h3>
        {timeline.map(point => (
          <div key={point.entry_id} className="p-4 rounded-lg border border-border">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-medium">
                  {new Date(point.meeting_date).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
                {point.video_title && (
                  <span className="text-xs text-muted-foreground ml-2">{point.video_title}</span>
                )}
              </div>
              <Link
                href={`/video?id=${point.entry_id}`}
                className="text-xs text-primary hover:underline"
              >
                View Meeting
              </Link>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="font-mono">
                Overall: <span className={point.avg_overall > 0.2 ? 'text-green-600' : point.avg_overall < -0.2 ? 'text-red-600' : 'text-yellow-600'}>
                  {point.avg_overall > 0 ? '+' : ''}{point.avg_overall.toFixed(2)}
                </span>
              </span>
              <span>{point.observation_count} speaker{point.observation_count !== 1 ? 's' : ''}</span>
              <div className="flex gap-1.5">
                {point.support_count > 0 && (
                  <span className="text-white px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: STANCE_COLORS.support }}>
                    {point.support_count} support
                  </span>
                )}
                {point.oppose_count > 0 && (
                  <span className="text-white px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: STANCE_COLORS.oppose }}>
                    {point.oppose_count} oppose
                  </span>
                )}
                {point.conditional_count > 0 && (
                  <span className="text-white px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: STANCE_COLORS.conditional }}>
                    {point.conditional_count} conditional
                  </span>
                )}
                {point.neutral_count > 0 && (
                  <span className="text-white px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: STANCE_COLORS.neutral }}>
                    {point.neutral_count} neutral
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Country summary */}
      {countries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Country Positions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {countries.slice(0, 12).map(c => (
              <div key={c.speaker_affiliation} className="p-2 rounded border border-border/50 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.country_name ?? c.speaker_affiliation}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                    style={{ backgroundColor: STANCE_COLORS[c.latest_stance] ?? STANCE_COLORS.neutral }}
                  >
                    {c.latest_stance}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1">
                  {c.meetings_appeared} meeting{c.meetings_appeared !== 1 ? 's' : ''} &middot;
                  Overall: {c.avg_overall > 0 ? '+' : ''}{c.avg_overall.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
