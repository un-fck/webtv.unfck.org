import { useState, useEffect } from "react";
import type { DashboardData } from "./types";
import { Leaderboard } from "./components/Leaderboard";
import { DiffView } from "./components/DiffView";
import "./index.css";

type Tab = "overview" | "transcriptions";

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    fetch("/data.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error)
    return (
      <div className="container" style={{ padding: "3rem 0" }}>
        Failed to load data: {error}
      </div>
    );
  if (!data)
    return (
      <div
        className="container"
        style={{ padding: "3rem 0", color: "var(--text-muted)" }}
      >
        Loading...
      </div>
    );

  const languages = [...new Set(data.results.map((r) => r.language))].sort();
  const providers = [...new Set(data.results.map((r) => r.provider))].sort();
  const sessionCount = new Set(data.results.map((r) => r.symbol)).size;

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <h1>UN Transcription Benchmark</h1>
        <p>
          Comparing {providers.length} speech-to-text providers across{" "}
          {languages.length} UN languages on {sessionCount} Security Council &
          General Assembly sessions
        </p>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${tab === "overview" ? "active" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`tab ${tab === "transcriptions" ? "active" : ""}`}
          onClick={() => setTab("transcriptions")}
        >
          Transcriptions & Diff
        </button>
      </div>

      {/* Metric explainer - shown on overview tab */}
      {tab === "overview" && (
        <div
          className="card"
          style={{
            marginBottom: "1.5rem",
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            lineHeight: "1.7",
          }}
        >
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: "0.5rem",
              }}
            >
              About the metrics
            </summary>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>WER (Word Error Rate)</strong> measures the proportion of
              words that differ between the transcription and the official
              verbatim record: (substitutions + insertions + deletions) /
              reference words. A WER of 30% means roughly 3 in 10 words differ.
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Normalized WER</strong> applies text normalization
              (lowercasing, punctuation removal) before comparison, reducing
              noise from formatting differences.
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>CER (Character Error Rate)</strong> is similar but
              operates at the character level. More suitable for Chinese (no
              word boundaries) and agglutinative languages.
            </p>
            <p>
              <strong>Note:</strong> Error rates of 20-40% are expected even for
              excellent transcription, because the reference is an{" "}
              <em>edited</em> verbatim record that smooths disfluencies and
              standardizes terminology, while live speech inevitably diverges
              from the published text.
            </p>
          </details>
        </div>
      )}

      {/* Tab content */}
      {tab === "overview" && <Leaderboard results={data.results} />}
      {tab === "transcriptions" && <DiffView data={data} />}

      {/* Footer */}
      <div className="footer">
        <p>
          Data from{" "}
          <a
            href="https://huggingface.co/datasets/united-nations/transcription-corpus"
            target="_blank"
            rel="noopener"
          >
            united-nations/transcription-corpus
          </a>{" "}
          &middot;{" "}
          <a
            href="https://huggingface.co/datasets/united-nations/transcription-results"
            target="_blank"
            rel="noopener"
          >
            Results dataset
          </a>{" "}
          &middot;{" "}
          <a
            href="https://github.com/un-fck/webtv.unfck.org/tree/main/eval"
            target="_blank"
            rel="noopener"
          >
            Source code
          </a>{" "}
          &middot; Generated {new Date(data.generatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export default App;
