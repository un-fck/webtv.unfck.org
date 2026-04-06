import { useMemo, useState } from "react";
import type { Result, MetricKey } from "../types";
import {
  METRIC_LABELS,
  LANGUAGE_NAMES,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  PROVIDER_FULL_LABELS,
  PROVIDER_META,
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

      {/* Provider ranking table */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3>
          Provider Ranking — Mean {METRIC_LABELS[metric]} (All Languages)
          <span className="lower-is-better">lower is better</span>
        </h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "2px solid var(--border)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "center", width: "2rem" }}>#</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Provider</th>
              <th style={{ padding: "0.5rem 0.75rem" }}>Model</th>
              <th style={{ padding: "0.5rem 0.75rem", minWidth: "200px" }}>
                {METRIC_LABELS[metric]} (95% CI)
              </th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                Pricing
              </th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                Diarization
              </th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                Custom Instructions
              </th>
            </tr>
          </thead>
          <tbody>
            {providerAgg.map(({ provider, mean, ciLow, ciHigh, n }, idx) => {
              const meta = PROVIDER_META[provider];
              const barPct = (mean / maxVal) * 100;
              const ciLowPct = (ciLow / maxVal) * 100;
              const ciHighPct = (ciHigh / maxVal) * 100;
              return (
                <tr
                  key={provider}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <span
                      className="provider-badge"
                      title={PROVIDER_FULL_LABELS[provider] || provider}
                    >
                      <span
                        className="provider-dot"
                        style={{
                          background: PROVIDER_COLORS[provider] || "#666",
                        }}
                      />
                      {PROVIDER_LABELS[provider] || provider}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    {PROVIDER_FULL_LABELS[provider] || provider}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div className="bar-track" style={{ height: "22px", flex: 1, overflow: "hidden" }}>
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
                              left: `${Math.max(ciLowPct, 0)}%`,
                              width: `${Math.min(ciHighPct, 100) - Math.max(ciLowPct, 0)}%`,
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          color: "var(--text-dim)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        n={n}
                      </span>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "center",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                    }}
                  >
                    {meta?.pricing || "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "center",
                    }}
                  >
                    {meta?.diarization ? "✔" : "—"}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "center",
                    }}
                  >
                    {meta?.prompting ? "✔" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-language breakdown tables */}
      <div className="lang-grid">
        {langBreakdown.map(({ lang, providerData }) => {
          const langMax =
            providerData.length > 0
              ? providerData[providerData.length - 1].mean
              : 1;
          return (
            <div key={lang} className="card" style={{ padding: "0.75rem" }}>
              <h3 style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                {LANGUAGE_NAMES[lang] || lang}
                <span className="lower-is-better">lower is better</span>
              </h3>
              <table
                className="lang-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.7rem",
                }}
              >
                <tbody>
                  {providerData.map(({ provider, mean, ciLow, ciHigh, n }, idx) => {
                    const barPct = (mean / langMax) * 100;
                    const ciLowPct = (ciLow / langMax) * 100;
                    const ciHighPct = (ciHigh / langMax) * 100;
                    return (
                      <tr key={provider}>
                        <td
                          style={{
                            padding: "0.2rem 0.25rem",
                            textAlign: "center",
                            color: "var(--text-dim)",
                            width: "1.2rem",
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td style={{ padding: "0.2rem 0.25rem", whiteSpace: "nowrap" }}>
                          <span
                            className="provider-badge"
                            title={PROVIDER_FULL_LABELS[provider] || provider}
                          >
                            <span
                              className="provider-dot"
                              style={{
                                background: PROVIDER_COLORS[provider] || "#666",
                              }}
                            />
                            {PROVIDER_LABELS[provider] || provider}
                          </span>
                        </td>
                        <td style={{ padding: "0.2rem 0.25rem", width: "100%" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <div className="bar-track" style={{ height: "18px", flex: 1, overflow: "hidden" }}>
                              <div
                                className="bar-fill"
                                style={{
                                  width: `${Math.min(barPct, 100)}%`,
                                  background: PROVIDER_COLORS[provider] || "#666",
                                }}
                              >
                                <span className="bar-value" style={{ fontSize: "0.65rem" }}>
                                  {(mean * 100).toFixed(1)}%
                                </span>
                              </div>
                              {n >= 2 && (
                                <div
                                  className="ci-whisker"
                                  style={{
                                    left: `${Math.max(ciLowPct, 0)}%`,
                                    width: `${Math.min(ciHighPct, 100) - Math.max(ciLowPct, 0)}%`,
                                  }}
                                />
                              )}
                            </div>
                            <span style={{ fontSize: "0.6rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                              n={n}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}
