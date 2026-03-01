'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import type { SentimentTimelinePoint } from '@/lib/sentiment-types';

const DIMENSION_COLORS: Record<string, string> = {
  avg_overall: '#009edb',      // UN blue
  avg_urgency: '#a0665c',      // red-ish
  avg_frustration: '#dc2626',  // red
  avg_enthusiasm: '#16a34a',   // green
  avg_flexibility: '#6c5b7b',  // purple
};

const STANCE_COLORS: Record<string, string> = {
  support: '#16a34a',
  oppose: '#dc2626',
  conditional: '#eab308',
  neutral: '#6b7280',
};

interface TimelineChartProps {
  data: SentimentTimelinePoint[];
}

export function TimelineChart({ data }: TimelineChartProps) {
  const [visibleDimensions, setVisibleDimensions] = useState<Set<string>>(
    new Set(['avg_overall'])
  );

  const toggleDimension = (dim: string) => {
    setVisibleDimensions(prev => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  };

  const formattedData = useMemo(() =>
    data.map(d => ({
      ...d,
      date_label: new Date(d.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })),
    [data],
  );

  if (data.length === 0) {
    return <div className="text-muted-foreground text-sm py-8 text-center">No sentiment data yet. Transcribe meetings to see trends.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Dimension toggles */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(DIMENSION_COLORS).map(([key, color]) => (
          <button
            key={key}
            onClick={() => toggleDimension(key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              visibleDimensions.has(key)
                ? 'text-white border-transparent'
                : 'text-muted-foreground border-border bg-background hover:bg-accent'
            }`}
            style={visibleDimensions.has(key) ? { backgroundColor: color } : undefined}
          >
            {key.replace('avg_', '')}
          </button>
        ))}
      </div>

      {/* Sentiment line chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={formattedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date_label" className="text-xs" tick={{ fontSize: 11 }} />
          <YAxis domain={[-1, 1]} className="text-xs" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          {Object.entries(DIMENSION_COLORS).map(([key, color]) =>
            visibleDimensions.has(key) ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={key === 'avg_overall' ? 2.5 : 1.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Stance breakdown bar chart */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Stance Distribution</h4>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={formattedData} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
            <XAxis dataKey="date_label" className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis className="text-xs" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
            />
            <Bar dataKey="support_count" stackId="stance" fill={STANCE_COLORS.support} name="Support" />
            <Bar dataKey="oppose_count" stackId="stance" fill={STANCE_COLORS.oppose} name="Oppose" />
            <Bar dataKey="conditional_count" stackId="stance" fill={STANCE_COLORS.conditional} name="Conditional" />
            <Bar dataKey="neutral_count" stackId="stance" fill={STANCE_COLORS.neutral} name="Neutral" />
            <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
