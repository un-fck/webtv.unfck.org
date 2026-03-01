import { NextRequest, NextResponse } from 'next/server';
import { getSentimentTimeline } from '@/lib/sentiment-db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;

    const timeline = await getSentimentTimeline(id, {
      affiliation: searchParams.get('affiliation') || undefined,
      group: searchParams.get('group') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    });

    return NextResponse.json(timeline);
  } catch (error) {
    console.error('Failed to get sentiment timeline:', error);
    return NextResponse.json({ error: 'Failed to get sentiment timeline' }, { status: 500 });
  }
}
