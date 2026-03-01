'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type { CountrySentimentRow } from '@/lib/sentiment-types';

const STANCE_COLORS: Record<string, string> = {
  support: '#16a34a',
  oppose: '#dc2626',
  conditional: '#eab308',
  neutral: '#6b7280',
};

interface CountryChartProps {
  data: CountrySentimentRow[];
  countryNames?: Map<string, string>;
}

export function CountryChart({ data, countryNames }: CountryChartProps) {
  if (data.length === 0) {
    return <div className="text-muted-foreground text-sm py-8 text-center">No country-level data yet.</div>;
  }

  const formatted = data
    .map(d => ({
      ...d,
      label: countryNames?.get(d.speaker_affiliation) ?? d.speaker_affiliation,
    }))
    .sort((a, b) => b.avg_overall - a.avg_overall)
    .slice(0, 25);

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={Math.max(200, formatted.length * 32 + 40)}>
        <BarChart
          data={formatted}
          layout="vertical"
          margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={75} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' }}
            formatter={(value) => [typeof value === 'number' ? value.toFixed(2) : String(value ?? '—')]}
          />
          <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          <Bar dataKey="avg_overall" name="Overall Sentiment">
            {formatted.map((entry, index) => (
              <Cell key={index} fill={STANCE_COLORS[entry.latest_stance] ?? STANCE_COLORS.neutral} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Country details table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-2 px-2">Country</th>
              <th className="text-center py-2 px-2">Stance</th>
              <th className="text-right py-2 px-2">Overall</th>
              <th className="text-right py-2 px-2">Urgency</th>
              <th className="text-right py-2 px-2">Frustration</th>
              <th className="text-right py-2 px-2">Meetings</th>
            </tr>
          </thead>
          <tbody>
            {formatted.map(row => (
              <tr key={row.speaker_affiliation} className="border-b border-border/50 hover:bg-accent/50">
                <td className="py-1.5 px-2 font-medium">{row.label}</td>
                <td className="py-1.5 px-2 text-center">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                    style={{ backgroundColor: STANCE_COLORS[row.latest_stance] ?? STANCE_COLORS.neutral }}
                  >
                    {row.latest_stance}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-right font-mono">{row.avg_overall.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{row.avg_urgency.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{row.avg_frustration.toFixed(2)}</td>
                <td className="py-1.5 px-2 text-right">{row.meetings_appeared}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
