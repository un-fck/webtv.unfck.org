import { useMemo, useState } from "react";
import type { Result, MetricKey } from "../types";
import {
  METRIC_LABELS,
  LANGUAGE_NAMES,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from "../types";

interface Props {
  results: Result[];
}

// t-distribution critical values for 95% CI (two-tailed)
const T_CRIT: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  15: 2.131,
  20: 2.086,
  30: 2.042,
  50: 2.009,
  100: 1.984,
};

function tCrit(df: number): number {
  if (df <= 0) return 0;
  if (T_CRIT[df]) return T_CRIT[df];
  const keys = Object.keys(T_CRIT)
    .map(Number)
    .sort((a, b) => a - b);
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
}

function aggregate(values: number[]): {
  mean: number;
  ciLow: number;
  ciHigh: number;
} {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, ciLow: mean, ciHigh: mean };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  const se = std / Math.sqrt(n);
  const t = tCrit(n - 1);
  return {
    mean,
    ciLow: Math.max(0, mean - t * se),
    ciHigh: Math.min(1, mean + t * se),
  };
}

export function Leaderboard({ results }: Props) {
  const [metric, setMetric] = useState<MetricKey>("normalizedWer");

  const languages = useMemo(
    () => [...new Set(results.map((r) => r.language))].sort(),
    [results],
  );
  const providers = useMemo(
    () => [...new Set(results.map((r) => r.provider))].sort(),
    [results],
  );

  // Aggregate by provider (all languages) with credible intervals
  const providerAgg = useMemo<AggResult[]>(() => {
    const groups: Record<string, number[]> = {};
    for (const r of results) {
      if (!groups[r.provider]) groups[r.provider] = [];
      groups[r.provider].push(r[metric]);
    }
    return Object.entries(groups)
      .map(([provider, values]) => {
        const { mean, ciLow, ciHigh } = aggregate(values);
        return { provider, mean, ciLow, ciHigh, n: values.length };
      })
      .sort((a, b) => a.mean - b.mean);
  }, [results, metric]);

  // Per-language breakdown data with CIs
  const langBreakdown = useMemo(() => {
    return languages.map((lang) => {
      const langResults = results.filter((r) => r.language === lang);
      const providerData = providers
        .map((provider) => {
          const values = langResults
            .filter((r) => r.provider === provider)
            .map((r) => r[metric]);
          if (values.length === 0) return null;
          const { mean, ciLow, ciHigh } = aggregate(values);
          return { provider, mean, ciLow, ciHigh, n: values.length };
        })
        .filter((d): d is AggResult => d !== null)
        .sort((a, b) => a.mean - b.mean);
      return { lang, providerData };
    });
  }, [results, languages, providers, metric]);

  // Max value for bar scale (across all views)
  const maxVal = useMemo(() => {
    let max = 0;
    for (const a of providerAgg) max = Math.max(max, a.ciHigh, a.mean);
    for (const { providerData } of langBreakdown) {
      for (const d of providerData) max = Math.max(max, d.ciHigh, d.mean);
    }
    return max * 1.1 || 1;
  }, [providerAgg, langBreakdown]);

  return (
    <>
      {/* Metric selector */}
      <div className="filters" style={{ marginBottom: "1rem" }}>
        <span className="filter-label">Metric</span>
        <div className="filter-group">
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((k) => (
            <button
              key={k}
              className={`chip ${metric === k ? "active" : ""}`}
              onClick={() => setMetric(k)}
            >
              {METRIC_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {/* Provider ranking with CI bars */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3>
          Provider Ranking — Mean {METRIC_LABELS[metric]} (All Languages) with
          95% CI
          <span className="lower-is-better">lower is better</span>
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
                    <span
                      className="provider-dot"
                      style={{
                        background: PROVIDER_COLORS[provider] || "#666",
                      }}
                    />
                    {PROVIDER_LABELS[provider] || provider}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.min(barPct, 100)}%`,
                      background: PROVIDER_COLORS[provider] || "#666",
                    }}
                  >
                    <span className="bar-value">
                      {(mean * 100).toFixed(1)}%
                    </span>
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
                <span
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--text-dim)",
                    width: "80px",
                    textAlign: "right",
                  }}
                >
                  n={n}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-language breakdown charts with CIs */}
      <div className="chart-grid">
        {langBreakdown.map(({ lang, providerData }) => (
          <div key={lang} className="card">
            <h3>
              {LANGUAGE_NAMES[lang] || lang}
              <span className="lower-is-better">lower is better</span>
            </h3>
            <div className="bar-chart">
              {providerData.map(({ provider, mean, ciLow, ciHigh, n }) => {
                const barPct = (mean / maxVal) * 100;
                const ciLowPct = (ciLow / maxVal) * 100;
                const ciHighPct = (ciHigh / maxVal) * 100;
                return (
                  <div key={provider} className="bar-row">
                    <div className="bar-label">
                      <span className="provider-badge">
                        <span
                          className="provider-dot"
                          style={{
                            background: PROVIDER_COLORS[provider] || "#666",
                          }}
                        />
                        {PROVIDER_LABELS[provider] || provider}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(barPct, 100)}%`,
                          background: PROVIDER_COLORS[provider] || "#666",
                        }}
                      >
                        <span className="bar-value">
                          {(mean * 100).toFixed(1)}%
                        </span>
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
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-dim)",
                        width: "50px",
                        textAlign: "right",
                      }}
                    >
                      n={n}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
