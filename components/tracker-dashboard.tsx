'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { TrackerItemForm } from './tracker-item-form';
import type { TrackedItemSummary, TrackedItemType } from '@/lib/sentiment-types';

const TYPE_BADGES: Record<TrackedItemType, { label: string; className: string }> = {
  topic: { label: 'Topic', className: 'bg-un-blue/10 text-un-blue' },
  resolution_article: { label: 'Article', className: 'bg-smoky/10 text-smoky' },
  proposal: { label: 'Proposal', className: 'bg-faded-jade/10 text-faded-jade' },
};

function SentimentBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = value > 0.2 ? 'text-green-600' : value < -0.2 ? 'text-red-600' : 'text-yellow-600';
  return <span className={`text-sm font-mono font-medium ${color}`}>{value > 0 ? '+' : ''}{value.toFixed(2)}</span>;
}

export function TrackerDashboard() {
  const [items, setItems] = useState<TrackedItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<TrackedItemType | 'all'>('all');
  const [suggestingFrom, setSuggestingFrom] = useState(false);
  const [suggestTranscriptId, setSuggestTranscriptId] = useState('');
  const [formPrefill, setFormPrefill] = useState<{
    type?: TrackedItemType;
    title?: string;
    description?: string;
    reference_text?: string;
    reference_document?: string;
    matching_keywords?: string[];
  } | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<Array<{
    type: TrackedItemType;
    title: string;
    description: string;
    matching_keywords: string[];
    reference_text: string | null;
    reference_document: string | null;
  }> | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/tracker/items');
      if (res.ok) {
        setItems(await res.json());
      }
    } catch {
      console.error('Failed to fetch tracked items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreated = (_id: string, _slug: string) => {
    setShowForm(false);
    setSuggestions(null);
    fetchItems();
  };

  const handleSuggest = async () => {
    if (!suggestTranscriptId.trim()) return;
    setSuggestingFrom(true);
    try {
      const res = await fetch('/api/tracker/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_id: suggestTranscriptId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
      }
    } catch {
      console.error('Failed to suggest items');
    } finally {
      setSuggestingFrom(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tracked item and all its sentiment data?')) return;
    try {
      await fetch(`/api/tracker/items/${id}`, { method: 'DELETE' });
      fetchItems();
    } catch {
      console.error('Failed to delete tracked item');
    }
  };

  const handleBackfill = async () => {
    if (!confirm('Re-analyze all existing transcripts? This may take a while and use API credits.')) return;
    try {
      const res = await fetch('/api/tracker/backfill', { method: 'POST' });
      const data = await res.json();
      alert(`Backfill complete: analyzed ${data.analyzed} transcript(s) across ${data.total_entries} entries.`);
      fetchItems();
    } catch {
      alert('Backfill failed. Check console for details.');
    }
  };

  const filteredItems = filterType === 'all' ? items : items.filter(i => i.type === filterType);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          + New Item
        </button>

        {/* Suggest from transcript */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={suggestTranscriptId}
            onChange={e => setSuggestTranscriptId(e.target.value)}
            placeholder="Transcript ID..."
            className="px-3 py-2 text-sm border border-border rounded-md bg-background w-48 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSuggest}
            disabled={suggestingFrom || !suggestTranscriptId.trim()}
            className="px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-accent disabled:opacity-50"
          >
            {suggestingFrom ? 'Analyzing...' : 'Suggest Items'}
          </button>
        </div>

        <div className="ml-auto">
          <button
            onClick={handleBackfill}
            className="px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-accent text-muted-foreground"
          >
            Backfill All
          </button>
        </div>
      </div>

      {/* AI Suggestions panel */}
      {suggestions && suggestions.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-accent/30">
          <h3 className="text-sm font-medium mb-3">AI-Suggested Items</h3>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-background rounded-md border border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_BADGES[s.type].className}`}>
                      {TYPE_BADGES[s.type].label}
                    </span>
                    <span className="text-sm font-medium">{s.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                </div>
                <button
                  onClick={() => {
                    setFormPrefill({
                      type: s.type,
                      title: s.title,
                      description: s.description,
                      reference_text: s.reference_text ?? undefined,
                      reference_document: s.reference_document ?? undefined,
                      matching_keywords: s.matching_keywords,
                    });
                    setShowForm(true);
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 shrink-0"
                >
                  Track
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setSuggestions(null)}
            className="text-xs text-muted-foreground mt-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['all', 'topic', 'resolution_article', 'proposal'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              filterType === t
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'all' ? 'All' : TYPE_BADGES[t].label}
            {t === 'all' ? ` (${items.length})` : ` (${items.filter(i => i.type === t).length})`}
          </button>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">
            {items.length === 0 ? 'No tracked items yet.' : 'No items match this filter.'}
          </p>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Create a tracked item to start monitoring sentiment across meetings.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => (
            <Link
              key={item.id}
              href={`/tracker/${item.slug}`}
              className="block p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_BADGES[item.type].className}`}>
                      {TYPE_BADGES[item.type].label}
                    </span>
                    <h3 className="font-medium text-sm truncate">{item.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{item.meeting_count} meeting{item.meeting_count !== 1 ? 's' : ''}</span>
                    <span>{item.observation_count} observation{item.observation_count !== 1 ? 's' : ''}</span>
                    {item.latest_meeting_date && (
                      <span>Latest: {new Date(item.latest_meeting_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <SentimentBadge value={item.avg_overall} />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs transition-opacity"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <TrackerItemForm
          onClose={() => {
            setShowForm(false);
            setFormPrefill(undefined);
          }}
          onCreated={handleCreated}
          prefill={formPrefill}
        />
      )}
    </div>
  );
}
