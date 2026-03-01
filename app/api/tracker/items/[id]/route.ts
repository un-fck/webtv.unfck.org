import { NextRequest, NextResponse } from 'next/server';
import { getTrackedItemById, updateTrackedItem, deleteTrackedItem } from '@/lib/sentiment-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const item = await getTrackedItemById(id);
    if (!item) {
      return NextResponse.json({ error: 'Tracked item not found' }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error('Failed to get tracked item:', error);
    return NextResponse.json({ error: 'Failed to get tracked item' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, reference_text, reference_document, matching_keywords } = body;

    const existing = await getTrackedItemById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Tracked item not found' }, { status: 404 });
    }

    await updateTrackedItem(id, {
      title,
      description,
      reference_text,
      reference_document,
      matching_keywords,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update tracked item:', error);
    return NextResponse.json({ error: 'Failed to update tracked item' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteTrackedItem(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete tracked item:', error);
    return NextResponse.json({ error: 'Failed to delete tracked item' }, { status: 500 });
  }
}
