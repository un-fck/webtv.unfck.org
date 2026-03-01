import { NextRequest, NextResponse } from 'next/server';
import { createTrackedItem, getTrackedItemsWithSummary } from '@/lib/sentiment-db';
import type { TrackedItemType } from '@/lib/sentiment-types';

export async function GET() {
  try {
    const items = await getTrackedItemsWithSummary();
    return NextResponse.json(items);
  } catch (error) {
    console.error('Failed to list tracked items:', error);
    return NextResponse.json({ error: 'Failed to list tracked items' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, description, reference_text, reference_document, matching_keywords } = body;

    if (!type || !title || !description) {
      return NextResponse.json({ error: 'type, title, and description are required' }, { status: 400 });
    }

    const validTypes: TrackedItemType[] = ['topic', 'resolution_article', 'proposal'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);

    await createTrackedItem({
      id,
      type,
      title,
      slug,
      description,
      reference_text: reference_text ?? null,
      reference_document: reference_document ?? null,
      matching_keywords: matching_keywords ?? [],
    });

    return NextResponse.json({ id, slug }, { status: 201 });
  } catch (error) {
    console.error('Failed to create tracked item:', error);
    const message = error instanceof Error && error.message.includes('UNIQUE')
      ? 'A tracked item with this title already exists'
      : 'Failed to create tracked item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
