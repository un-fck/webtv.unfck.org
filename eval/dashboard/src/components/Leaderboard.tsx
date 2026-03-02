import { useMemo, useState } from 'react';
import type { Result, MetricKey } from '../types';
import { METRIC_LABELS, LANGUAGE_NAMES, PROVIDER_COLORS, PROVIDER_LABELS } from '../types';

interface Props {
  results: Result[];
  selectedLanguage: string | null;
  selectedProvider: string | null;
}

// t-distribution critical values for 95% CI (two-tailed)
const T_CRIT: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  15: 2.131, 20: 2.086, 30: 2.042, 50: 2.009, 100: 1.984,
};

function tCrit(df: number): number {
  if (df <= 0) return 0;
  if (T_CRIT[df]) return T_CRIT[df];
  // Interpolate
  const keys = Object.keys(T_CRIT).map(Number).sort((a, b) => a - b);
  if (df < keys[0]) return T_CRIT[keys[0]];
  if (df > keys[keys.length - 1]) return 1.96;
  for (let i = 0; i < keys.length - 1; i++) {
    if (df >= keys[i] && df <= keys[i + 1]) {
      const frac = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return T_CRIT[keys[i]] * (1 - frac) + T_CRIT[keys[i + 1]] * frac;
    }
  }
  return 1.96;
}

interface AggResult {
  provider: string;
  mean: number;
  ciLow: number;
  ciHigh: number;
  n: number;
  std: number;
}

function aggregate(values: number[]): { mean: number; ciLow: number; ciHigh: number; std: number } {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, ciLow: mean, ciHigh: mean, std: 0 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const se = std / Math.sqrt(n);
  const t = tCrit(n - 1);
  return { mean, ciLow: Math.max(0, mean - t * se), ciHigh: Math.min(1, mean + t * se), std };
}

function metricColor(value: number): string {
  // Green (good) → Yellow → Red (bad)
  if (value <= 0.3) return `hsl(${120 - value * 200}, 70%, 42%)`;
  if (value <= 0.6) return `hsl(${120 - value * 200}, 70%, 42%)`;
  return `hsl(${Math.max(0, 120 - value * 140)}, 70%, 42%)`;
}

function heatmapBg(value: number): string {
  // Lighter version for cell background
  if (value <= 0.3) return `hsla(${120 - value * 200}, 80%, 50%, 0.12)`;
  if (value <= 0.6) return `hsla(${120 - value * 200}, 80%, 50%, 0.12)`;
  return `hsla(${Math.max(0, 120 - value * 140)}, 80%, 50%, 0.12)`;
}

export function Leaderboard({ results, selectedLanguage, selectedProvider }: Props) {
  const [metric, setMetric] = useState<MetricKey>('normalizedWer');

  const filtered = useMemo(() => {
    let r = results;
    if (selectedLanguage) r = r.filter(x => x.language === selectedLanguage);
    if (selectedProvider) r = r.filter(x => x.provider === selectedProvider);
    return r;
  }, [results, selectedLanguage, selectedProvider]);

  // Aggregate by provider with credible intervals
  const providerAgg = useMemo<AggResult[]>(() => {
    const groups: Record<string, number[]> = {};
    for (const r of filtered) {
      if (!groups[r.provider]) groups[r.provider] = [];
      groups[r.provider].push(r[metric]);
    }
    return Object.entries(groups)
      .map(([provider, values]) => {
        const { mean, ciLow, ciHigh, std } = aggregate(values);
        return { provider, mean, ciLow, ciHigh, n: values.length, std };
      })
      .sort((a, b) => a.mean - b.mean);
  }, [filtered, metric]);

  // Heatmap: provider × language
  const languages = useMemo(() => [...new Set(results.map(r => r.language))].sort(), [results]);
  const providers = useMemo(() => [...new Set(results.map(r => r.provider))].sort(), [results]);

  const heatmapData = useMemo(() => {
    const map: Record<string, Record<string, { mean: number; ciLow: number; ciHigh: number; n: number }>> = {};
    for (const p of providers) {
      map[p] = {};
      for (const l of languages) {
        const values = results.filter(r => r.provider === p && r.language === l).map(r => r[metric]);
        if (values.length > 0) {
          const { mean, ciLow, ciHigh } = aggregate(values);
          map[p][l] = { mean, ciLow, ciHigh, n: values.length };
        }
      }
    }
    return map;
  }, [results, providers, languages, metric]);

  // Max value for bar scale
  const maxVal = providerAgg.length > 0
    ? Math.max(...providerAgg.map(p => p.ciHigh), ...providerAgg.map(p => p.mean)) * 1.1
    : 1;

  return (
    <>
      {/* Metric selector */}
      <div className="filters" style={{ marginBottom: '1rem' }}>
        <span className="filter-label">Metric</span>
        <div className="filter-group">
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map(k => (
            <button
              key={k}
              className={`chip ${metric === k ? 'active' : ''}`}
              onClick={() => setMetric(k)}
            >
              {METRIC_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {/* Provider ranking with CI bars */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>
          Provider Ranking — Mean {METRIC_LABELS[metric]}
          {selectedLanguage ? ` (${LANGUAGE_NAMES[selectedLanguage]})` : ' (All Languages)'}
          {' '}with 95% CI
        </h3>
        <div className="bar-chart">
          {providerAgg.map(({ provider, mean, ciLow, ciHigh, n }) => {
            const barPct = (mean / maxVal) * 100;
            const ciLowPct = (ciLow / maxVal) * 100;
            const ciHighPct = (ciHigh / maxVal) * 100;
            return (
              <div key={provider} className="bar-row">
                <div className="bar-label">
                  <span className="provider-badge">
                    <span className="provider-dot" style={{ background: PROVIDER_COLORS[provider] || '#666' }} />
                    {PROVIDER_LABELS[provider] || provider}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(barPct, 100)}%`,
                      background: PROVIDER_COLORS[provider] || '#666',
                    }}
                  >
                    <span className="bar-value">{(mean * 100).toFixed(1)}%</span>
                  </div>
                  {n >= 2 && (
                    <div
                      className="ci-whisker"
                      style={{
                        left: `${ciLowPct}%`,
                        width: `${ciHighPct - ciLowPct}%`,
                      }}
                    />
                  )}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', width: '80px', textAlign: 'right' }}>
                  n={n}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Heatmap: Provider × Language */}
      {!selectedLanguage && !selectedProvider && (
        <div className="card">
          <h3>Provider x Language — Mean {METRIC_LABELS[metric]}</h3>
          <div className="table-container">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Provider</th>
                  {languages.map(l => (
                    <th key={l} style={{ textAlign: 'center' }}>{LANGUAGE_NAMES[l] || l}</th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Mean</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(p => {
                  const provMean = providerAgg.find(a => a.provider === p)?.mean;
                  return (
                    <tr key={p}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="provider-badge">
                          <span className="provider-dot" style={{ background: PROVIDER_COLORS[p] || '#666' }} />
                          {PROVIDER_LABELS[p] || p}
                        </span>
                      </td>
                      {languages.map(l => {
                        const d = heatmapData[p]?.[l];
                        if (!d) return <td key={l}><div className="heatmap-cell">-</div></td>;
                        return (
                          <td key={l} style={{ background: heatmapBg(d.mean) }}>
                            <div className="heatmap-cell">
                              <span className="heatmap-value" style={{ color: metricColor(d.mean) }}>
                                {(d.mean * 100).toFixed(1)}%
                              </span>
                              {d.n >= 2 && (
                                <span className="heatmap-ci">
                                  [{(d.ciLow * 100).toFixed(0)}-{(d.ciHigh * 100).toFixed(0)}]
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td style={{ background: provMean != null ? heatmapBg(provMean) : undefined }}>
                        <div className="heatmap-cell">
                          {provMean != null && (
                            <span className="heatmap-value" style={{ color: metricColor(provMean) }}>
                              {(provMean * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
