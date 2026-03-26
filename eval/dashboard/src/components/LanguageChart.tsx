import { useMemo } from "react";
import type { Result, MetricKey } from "../types";
import { LANGUAGE_NAMES, PROVIDER_COLORS, PROVIDER_LABELS } from "../types";

interface Props {
  results: Result[];
  metric: MetricKey;
}

export function LanguageChart({ results, metric }: Props) {
  const languages = useMemo(
    () => [...new Set(results.map((r) => r.language))].sort(),
    [results],
  );
  const providers = useMemo(
    () => [...new Set(results.map((r) => r.provider))].sort(),
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
    <div className="chart-grid">
      {languages.map((lang) => (
        <div key={lang} className="card">
          <h3>{LANGUAGE_NAMES[lang] || lang}</h3>
          <div className="bar-chart">
            {providers.map((provider) => {
              const d = data[lang]?.[provider];
              if (!d) return null;
              const mean = d.sum / d.count;
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
                        width: `${Math.min(mean * 100, 100)}%`,
                        background: PROVIDER_COLORS[provider] || "#666",
                      }}
                    >
                      <span className="bar-value">
                        {(mean * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
