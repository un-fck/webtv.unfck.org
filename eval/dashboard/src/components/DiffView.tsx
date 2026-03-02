import { useState, useMemo } from 'react';
import type { DashboardData } from '../types';
import { LANGUAGE_NAMES, PROVIDER_LABELS, PROVIDER_COLORS } from '../types';
import { alignedDiff } from '../lib/diff';
import type { DiffToken } from '../lib/diff';

interface Props {
  data: DashboardData;
}

function renderTokens(tokens: DiffToken[]) {
  return tokens.map((token, i) => {
    if (token.type === 'equal') return <span key={i}>{token.text}</span>;
    if (token.type === 'delete') return <span key={i} className="diff-delete">{token.text}</span>;
    if (token.type === 'insert') return <span key={i} className="diff-insert">{token.text}</span>;
    return null;
  });
}

export function DiffView({ data }: Props) {
  const symbols = useMemo(() => Object.keys(data.groundTruth).sort(), [data]);
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0] || '');
  const [selectedLang, setSelectedLang] = useState('en');
  const [selectedProvider, setSelectedProvider] = useState('assemblyai');

  const availableLangs = useMemo(() => {
    if (!selectedSymbol || !data.groundTruth[selectedSymbol]) return [];
    return Object.keys(data.groundTruth[selectedSymbol]).sort();
  }, [selectedSymbol, data]);

  const availableProviders = useMemo(() => {
    if (!selectedSymbol || !data.transcriptions[selectedSymbol]?.[selectedLang]) return [];
    return Object.keys(data.transcriptions[selectedSymbol][selectedLang]).sort();
  }, [selectedSymbol, selectedLang, data]);

  const groundTruth = data.groundTruth[selectedSymbol]?.[selectedLang] || '';
  const transcription = data.transcriptions[selectedSymbol]?.[selectedLang]?.[selectedProvider] || '';

  const alignedRows = useMemo(() => {
    if (!groundTruth || !transcription) return [];
    return alignedDiff(groundTruth, transcription);
  }, [groundTruth, transcription]);

  const matchingResult = data.results.find(
    r => r.symbol === selectedSymbol && r.language === selectedLang && r.provider === selectedProvider
  );

  return (
    <div>
      {/* Selectors */}
      <div className="filters">
        <span className="filter-label">Session</span>
        <select
          className="session-select"
          value={selectedSymbol}
          onChange={e => setSelectedSymbol(e.target.value)}
        >
          {symbols.map(s => (
            <option key={s} value={s}>
              {s} {data.sessions[s]?.notes ? `\u2014 ${data.sessions[s].notes.split('(')[0].trim().slice(0, 60)}` : ''}
            </option>
          ))}
        </select>

        <span className="filter-label" style={{ marginLeft: '1rem' }}>Language</span>
        <div className="filter-group">
          {availableLangs.map(lang => (
            <button
              key={lang}
              className={`chip ${selectedLang === lang ? 'active' : ''}`}
              onClick={() => setSelectedLang(lang)}
            >
              {LANGUAGE_NAMES[lang] || lang}
            </button>
          ))}
        </div>

        <span className="filter-label" style={{ marginLeft: '1rem' }}>Provider</span>
        <div className="filter-group">
          {availableProviders.map(p => (
            <button
              key={p}
              className={`chip ${selectedProvider === p ? 'active' : ''}`}
              onClick={() => setSelectedProvider(p)}
              style={selectedProvider === p ? { background: PROVIDER_COLORS[p] || 'var(--accent)', borderColor: PROVIDER_COLORS[p] || 'var(--accent)' } : {}}
            >
              {PROVIDER_LABELS[p] || p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {matchingResult && (
        <div className="card" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>WER</div>
            <div className="metric-cell" style={{ fontSize: '1.2rem' }}>{(matchingResult.wer * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Normalized WER</div>
            <div className="metric-cell" style={{ fontSize: '1.2rem' }}>{(matchingResult.normalizedWer * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>CER</div>
            <div className="metric-cell" style={{ fontSize: '1.2rem' }}>{(matchingResult.cer * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Ref Words</div>
            <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>{matchingResult.refLength}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Hyp Words</div>
            <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)' }}>{matchingResult.hypLength}</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {groundTruth && transcription && (
        <div className="diff-legend">
          <div className="diff-legend-item">
            <div className="diff-legend-swatch" style={{ background: '#fecaca' }} />
            <span>Deleted from reference</span>
          </div>
          <div className="diff-legend-item">
            <div className="diff-legend-swatch" style={{ background: '#bbf7d0' }} />
            <span>Added by transcription</span>
          </div>
          <div className="diff-legend-item">
            <div className="diff-legend-swatch" style={{ background: '#eff6ff' }} />
            <span>Modified</span>
          </div>
        </div>
      )}

      {/* Side-by-side diff */}
      {groundTruth && transcription ? (
        <div>
          <div className="diff-side-by-side-header">
            <div>Ground Truth (Official Verbatim Record)</div>
            <div>Transcription ({PROVIDER_LABELS[selectedProvider] || selectedProvider})</div>
          </div>
          <div className="diff-side-by-side">
            <div className="diff-rows" style={{ gridColumn: '1 / -1' }}>
              {alignedRows.map((row, i) => (
                <div key={i} className="diff-row">
                  <div className={`diff-cell diff-cell-left ${row.type === 'removed' ? 'diff-row-removed' : row.type === 'changed' ? 'diff-row-changed' : ''}`}>
                    {row.left.length > 0 ? renderTokens(row.left) : <span style={{ opacity: 0.3 }}>&nbsp;</span>}
                  </div>
                  <div className={`diff-cell ${row.type === 'added' ? 'diff-row-added' : row.type === 'changed' ? 'diff-row-changed' : ''}`}>
                    {row.right.length > 0 ? renderTokens(row.right) : <span style={{ opacity: 0.3 }}>&nbsp;</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
          {!groundTruth && !transcription
            ? 'Select a session with available ground truth and transcription'
            : !groundTruth
              ? 'No ground truth available for this language'
              : 'No transcription available for this provider/language combination'}
        </div>
      )}
    </div>
  );
}
