import { NextRequest, NextResponse } from 'next/server';
import { getSentimentHeatmap } from '@/lib/sentiment-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const heatmap = await getSentimentHeatmap(id);
    return NextResponse.json(heatmap);
  } catch (error) {
    console.error('Failed to get sentiment heatmap:', error);
    return NextResponse.json({ error: 'Failed to get sentiment heatmap' }, { status: 500 });
  }
}
