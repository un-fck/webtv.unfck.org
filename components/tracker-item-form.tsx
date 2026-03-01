'use client';

import { useState } from 'react';
import type { TrackedItemType } from '@/lib/sentiment-types';

interface TrackerItemFormProps {
  onClose: () => void;
  onCreated: (id: string, slug: string) => void;
  prefill?: {
    type?: TrackedItemType;
    title?: string;
    description?: string;
    reference_text?: string;
    reference_document?: string;
    matching_keywords?: string[];
  };
}

const TYPE_LABELS: Record<TrackedItemType, string> = {
  topic: 'Topic',
  resolution_article: 'Resolution Article',
  proposal: 'Proposal',
};

export function TrackerItemForm({ onClose, onCreated, prefill }: TrackerItemFormProps) {
  const [type, setType] = useState<TrackedItemType>(prefill?.type ?? 'topic');
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [referenceText, setReferenceText] = useState(prefill?.reference_text ?? '');
  const [referenceDocument, setReferenceDocument] = useState(prefill?.reference_document ?? '');
  const [keywordsText, setKeywordsText] = useState(prefill?.matching_keywords?.join(', ') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const keywords = keywordsText
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);

      const res = await fetch('/api/tracker/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          description,
          reference_text: referenceText || null,
          reference_document: referenceDocument || null,
          matching_keywords: keywords,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }

      const { id, slug } = await res.json();
      onCreated(id, slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tracked item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">New Tracked Item</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Type</label>
              <div className="flex gap-2">
                {(Object.keys(TYPE_LABELS) as TrackedItemType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                      type === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover:bg-accent'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Climate Finance"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="1-3 sentences describing what to track and why..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                required
              />
            </div>

            {/* Reference fields for resolution_article and proposal */}
            {(type === 'resolution_article' || type === 'proposal') && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    {type === 'resolution_article' ? 'Document Reference' : 'Proposal Reference'}
                  </label>
                  <input
                    type="text"
                    value={referenceDocument}
                    onChange={e => setReferenceDocument(e.target.value)}
                    placeholder="e.g., A/RES/78/123 or Draft resolution L.42"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Reference Text</label>
                  <textarea
                    value={referenceText}
                    onChange={e => setReferenceText(e.target.value)}
                    placeholder="Paste the actual text of the article/paragraph..."
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              </>
            )}

            {/* Keywords */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Matching Keywords</label>
              <input
                type="text"
                value={keywordsText}
                onChange={e => setKeywordsText(e.target.value)}
                placeholder="climate finance, green climate fund, adaptation funding"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated keywords to help match across meetings</p>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting || !title || !description}
                className="flex-1 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating...' : 'Create Tracked Item'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
