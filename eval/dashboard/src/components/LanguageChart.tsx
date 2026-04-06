import { useMemo } from "react";
import type { Result, MetricKey } from "../types";
import {
  LANGUAGE_NAMES,
  METRIC_LABELS,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from "../types";

interface Props {
  results: Result[];
  metric: MetricKey;
}

export function LanguageChart({ results, metric }: Props) {
  const languages = useMemo(
    () => [...new Set(results.map((r) => r.language))].sort(),
    [results],
  );

  const data = useMemo(() => {
    const map: Record<
      string,
      Record<string, { sum: number; count: number }>
    > = {};
    for (const r of results) {
      if (!map[r.language]) map[r.language] = {};
      if (!map[r.language][r.provider])
        map[r.language][r.provider] = { sum: 0, count: 0 };
      map[r.language][r.provider].sum += r[metric];
      map[r.language][r.provider].count++;
    }
    return map;
  }, [results, metric]);

  return (
    <div className="lang-grid">
      {languages.map((lang) => {
        const langData = data[lang] || {};
        const sorted = Object.entries(langData)
          .map(([provider, { sum, count }]) => ({
            provider,
            mean: sum / count,
            count,
          }))
          .sort((a, b) => a.mean - b.mean);

        const maxVal = sorted.length > 0 ? sorted[sorted.length - 1].mean : 1;

        return (
          <div key={lang} className="card">
            <h3>
              {LANGUAGE_NAMES[lang] || lang}
              <span className="lower-is-better">lower is better</span>
            </h3>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8rem",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "2px solid var(--border)",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "0.35rem 0.5rem", textAlign: "center", width: "1.5rem" }}>#</th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Provider</th>
                  <th style={{ padding: "0.35rem 0.5rem", minWidth: "120px" }}>
                    {METRIC_LABELS[metric]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ provider, mean, count }, idx) => {
                  const barPct = (mean / maxVal) * 100;
                  return (
                    <tr
                      key={provider}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td
                        style={{
                          padding: "0.35rem 0.5rem",
                          textAlign: "center",
                          color: "var(--text-muted)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {idx + 1}
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        <span className="provider-badge">
                          <span
                            className="provider-dot"
                            style={{
                              background:
                                PROVIDER_COLORS[provider] || "#666",
                            }}
                          />
                          {PROVIDER_LABELS[provider] || provider}
                        </span>
                      </td>
                      <td style={{ padding: "0.35rem 0.5rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <div
                            className="bar-track"
                            style={{ height: "20px", flex: 1 }}
                          >
                            <div
                              className="bar-fill"
                              style={{
                                width: `${Math.min(barPct, 100)}%`,
                                background:
                                  PROVIDER_COLORS[provider] || "#666",
                              }}
                            >
                              <span className="bar-value">
                                {(mean * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "var(--text-dim)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            n={count}
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
  );
}
