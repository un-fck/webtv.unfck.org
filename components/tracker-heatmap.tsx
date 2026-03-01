'use client';

import { useMemo } from 'react';
import type { SentimentHeatmapCell } from '@/lib/sentiment-types';

interface HeatmapProps {
  data: SentimentHeatmapCell[];
  countryNames?: Map<string, string>;
}

function sentimentToColor(value: number): string {
  // Diverging scale: red (-1) -> yellow (0) -> green (+1)
  if (value < -0.5) return '#dc2626';      // strong negative
  if (value < -0.2) return '#f87171';      // moderate negative
  if (value < -0.05) return '#fca5a5';     // slight negative
  if (value < 0.05) return '#fde68a';      // neutral
  if (value < 0.2) return '#86efac';       // slight positive
  if (value < 0.5) return '#4ade80';       // moderate positive
  return '#16a34a';                         // strong positive
}

export function Heatmap({ data, countryNames }: HeatmapProps) {
  const { countries, dates, cellMap } = useMemo(() => {
    const countriesSet = new Set<string>();
    const datesSet = new Set<string>();
    const cellMap = new Map<string, SentimentHeatmapCell>();

    for (const cell of data) {
      countriesSet.add(cell.speaker_affiliation);
      datesSet.add(cell.meeting_date);
      cellMap.set(`${cell.speaker_affiliation}|${cell.meeting_date}`, cell);
    }

    const countries = [...countriesSet].sort();
    const dates = [...datesSet].sort();
    return { countries, dates, cellMap };
  }, [data]);

  if (data.length === 0) {
    return <div className="text-muted-foreground text-sm py-8 text-center">No heatmap data yet.</div>;
  }

  const dateLabels = dates.map(d =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background z-10 text-left py-2 px-2 min-w-[80px]">Country</th>
            {dateLabels.map((label, i) => (
              <th key={dates[i]} className="text-center py-2 px-1 min-w-[60px] font-normal text-muted-foreground">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {countries.map(country => (
            <tr key={country} className="hover:bg-accent/30">
              <td className="sticky left-0 bg-background z-10 py-1 px-2 font-medium border-r border-border">
                {countryNames?.get(country) ?? country}
              </td>
              {dates.map(date => {
                const cell = cellMap.get(`${country}|${date}`);
                if (!cell) {
                  return <td key={date} className="py-1 px-1 text-center text-muted-foreground/30">—</td>;
                }
                return (
                  <td key={date} className="py-1 px-1 text-center">
                    <div
                      className="inline-block w-8 h-6 rounded-sm flex items-center justify-center text-[10px] font-medium"
                      style={{
                        backgroundColor: sentimentToColor(cell.sentiment_overall),
                        color: Math.abs(cell.sentiment_overall) > 0.3 ? 'white' : '#1f2937',
                      }}
                      title={`${countryNames?.get(country) ?? country} on ${date}: ${cell.sentiment_overall.toFixed(2)} (${cell.stance})`}
                    >
                      {cell.sentiment_overall > 0 ? '+' : ''}{cell.sentiment_overall.toFixed(1)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Color legend */}
      <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
        <span>Opposed</span>
        <div className="flex gap-0.5">
          {[-0.8, -0.4, -0.1, 0, 0.1, 0.4, 0.8].map(v => (
            <div
              key={v}
              className="w-6 h-3 rounded-sm"
              style={{ backgroundColor: sentimentToColor(v) }}
            />
          ))}
        </div>
        <span>Supportive</span>
      </div>
    </div>
  );
}
