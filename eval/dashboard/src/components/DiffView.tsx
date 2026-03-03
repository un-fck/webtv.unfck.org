import { useState, useMemo } from 'react';
import type { DashboardData, Result } from '../types';
import { LANGUAGE_NAMES, PROVIDER_LABELS, PROVIDER_COLORS } from '../types';
import { alignedDiff3 } from '../lib/diff';
import type { DiffToken } from '../lib/diff';

/** documents.un.org language codes */
const DOC_LANG_CODES: Record<string, string> = {
  en: 'en', fr: 'fr', es: 'es', ar: 'ar', zh: 'zh', ru: 'ru',
};

interface Props {
  data: DashboardData;
}

function renderTokens(tokens: DiffToken[], showDiff: boolean) {
  if (!showDiff) {
    // Plain text: show the transcription text without any highlighting
    return tokens.map((token, i) => {
      if (token.type === 'equal') return <span key={i}>{token.text}</span>;
      if (token.type === 'substitute') return <span key={i}>{token.text}</span>;
      if (token.type === 'insert') return <span key={i}>{token.text}</span>;
      // delete tokens are ref-only words, skip them in plain mode
      return null;
    });
  }
  return tokens.map((token, i) => {
    if (token.type === 'equal') return <span key={i}>{token.text}</span>;
    if (token.type === 'substitute') {
      if (token.punctOnly) {
        return (
          <span key={i} className="diff-punct">
            <span className="diff-punct-old">{token.oldText}</span>
            <span className="diff-punct-new">{token.text}</span>
          </span>
        );
      }
      return (
        <span key={i} className="diff-substitute">
          <span className="diff-sub-old">{token.oldText}</span>
          <span className="diff-sub-new">{token.text}</span>
        </span>
      );
    }
    if (token.type === 'delete') return <span key={i} className="diff-delete">{token.text}</span>;
    if (token.type === 'insert') return <span key={i} className="diff-insert">{token.text}</span>;
    return null;
  });
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="diff-metric-badge">
      <span className="diff-metric-label">{label}</span>
      <span className="diff-metric-value">{value}</span>
    </span>
  );
}

function ProviderHeader({ provider, result, availableProviders, onChange }: {
  provider: string;
  result: Result | undefined;
  availableProviders: string[];
  onChange: (p: string) => void;
}) {
  return (
    <div className="diff-col-header">
      <select
        className="diff-provider-select"
        value={provider}
        onChange={e => onChange(e.target.value)}
        style={{ borderColor: PROVIDER_COLORS[provider] }}
      >
        {availableProviders.map(p => (
          <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
        ))}
      </select>
      {result && (
        <div className="diff-metric-row">
          <MetricBadge label="WER" value={`${(result.wer * 100).toFixed(1)}%`} />
          <MetricBadge label="nWER" value={`${(result.normalizedWer * 100).toFixed(1)}%`} />
          <MetricBadge label="CER" value={`${(result.cer * 100).toFixed(1)}%`} />
        </div>
      )}
    </div>
  );
}


export function DiffView({ data }: Props) {
  const symbols = useMemo(() => Object.keys(data.groundTruth).sort(), [data]);
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0] || '');
  const [selectedLang, setSelectedLang] = useState('en');
  const [providerA, setProviderA] = useState('assemblyai');
  const [providerB, setProviderB] = useState('azure-openai');
  const [showDiff, setShowDiff] = useState(true);

  const availableLangs = useMemo(() => {
    if (!selectedSymbol || !data.groundTruth[selectedSymbol]) return [];
    return Object.keys(data.groundTruth[selectedSymbol]).sort();
  }, [selectedSymbol, data]);

  const availableProviders = useMemo(() => {
    if (!selectedSymbol || !data.transcriptions[selectedSymbol]?.[selectedLang]) return [];
    return Object.keys(data.transcriptions[selectedSymbol][selectedLang]).sort();
  }, [selectedSymbol, selectedLang, data]);

  const groundTruth = data.groundTruth[selectedSymbol]?.[selectedLang] || '';
  const textA = data.transcriptions[selectedSymbol]?.[selectedLang]?.[providerA] || '';
  const textB = data.transcriptions[selectedSymbol]?.[selectedLang]?.[providerB] || '';

  const alignedRows = useMemo(() => {
    if (!groundTruth || (!textA && !textB)) return [];
    return alignedDiff3(groundTruth, textA, textB);
  }, [groundTruth, textA, textB]);

  const resultA = data.results.find(
    r => r.symbol === selectedSymbol && r.language === selectedLang && r.provider === providerA
  );
  const resultB = data.results.find(
    r => r.symbol === selectedSymbol && r.language === selectedLang && r.provider === providerB
  );

  // Source links
  const session = data.sessions[selectedSymbol];
  const pvUrl = selectedSymbol
    ? `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(selectedSymbol)}&l=${DOC_LANG_CODES[selectedLang] || 'en'}`
    : null;
  const webtvUrl = session?.assetId
    ? `https://webtv.un.org/en/asset/${session.assetId}`
    : null;

  return (
    <div>
      {/* Selectors */}
      <div className="diff-filters">
        <div className="diff-filter-item">
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
        </div>
        <div className="diff-filter-item">
          <span className="filter-label">Language</span>
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
        </div>
        {/* Source links inline */}
        {(pvUrl || webtvUrl) && (
          <div className="diff-filter-item" style={{ marginLeft: 'auto' }}>
            {pvUrl && (
              <a href={pvUrl} target="_blank" rel="noopener" className="source-link">
                Verbatim Record
              </a>
            )}
            {webtvUrl && (
              <a href={webtvUrl} target="_blank" rel="noopener" className="source-link">
                Web TV
              </a>
            )}
          </div>
        )}
      </div>

      {/* Legend + diff toggle */}
      {groundTruth && (textA || textB) && (
        <div className="diff-legend">
          {showDiff && (
            <>
              <div className="diff-legend-item">
                <div className="diff-legend-swatch" style={{ background: '#fecaca' }} />
                <span>Missed from reference</span>
              </div>
              <div className="diff-legend-item">
                <div className="diff-legend-swatch" style={{ background: '#bbf7d0' }} />
                <span>Added by transcription</span>
              </div>
              <div className="diff-legend-item">
                <div className="diff-legend-swatch" style={{ background: '#e5e7eb' }} />
                <span>Punctuation only</span>
              </div>
            </>
          )}
          <button
            className={`chip ${showDiff ? 'active' : ''}`}
            onClick={() => setShowDiff(d => !d)}
            style={{ marginLeft: 'auto' }}
          >
            {showDiff ? 'Hide diff' : 'Show diff'}
          </button>
        </div>
      )}

      {/* 3-column diff — header has provider selects + metrics */}
      {groundTruth && (textA || textB) ? (
        <div className="diff-wrapper">
          <div className="diff-scroll">
            <div className="diff-3col-header">
              <div className="diff-col-header">
                <span className="diff-col-title">Ground Truth</span>
                {resultA && (
                  <span className="diff-metric-row">
                    <span className="diff-metric-badge">
                      <span className="diff-metric-value" style={{ opacity: 0.5 }}>
                        {resultA.refLength} words
                      </span>
                    </span>
                  </span>
                )}
              </div>
              <ProviderHeader
                provider={providerA}
                result={resultA}
                availableProviders={availableProviders}
                onChange={setProviderA}
              />
              <ProviderHeader
                provider={providerB}
                result={resultB}
                availableProviders={availableProviders}
                onChange={setProviderB}
              />
            </div>
            {alignedRows.map((row, i) => (
              <div key={i} className="diff-3col-row">
                <div className={`diff-cell diff-cell-border ${!row.ref ? 'diff-cell-empty' : ''}`}>
                  {row.ref || <span style={{ opacity: 0.2 }}>&nbsp;</span>}
                </div>
                <div className={`diff-cell diff-cell-border ${row.colA.length > 0 && !row.ref ? 'diff-row-added' : row.colA.length > 0 && row.ref ? 'diff-row-changed' : 'diff-cell-empty'}`}>
                  {row.colA.length > 0 ? renderTokens(row.colA, showDiff) : <span style={{ opacity: 0.2 }}>&nbsp;</span>}
                </div>
                <div className={`diff-cell ${row.colB.length > 0 && !row.ref ? 'diff-row-added' : row.colB.length > 0 && row.ref ? 'diff-row-changed' : 'diff-cell-empty'}`}>
                  {row.colB.length > 0 ? renderTokens(row.colB, showDiff) : <span style={{ opacity: 0.2 }}>&nbsp;</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
          {!groundTruth
            ? 'No ground truth available for this language'
            : 'No transcriptions available for this provider/language combination'}
        </div>
      )}
    </div>
  );
}
