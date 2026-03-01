import { NextRequest, NextResponse } from 'next/server';
import { getCountrySentimentSummary } from '@/lib/sentiment-db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const countries = await getCountrySentimentSummary(id);
    return NextResponse.json(countries);
  } catch (error) {
    console.error('Failed to get country sentiment:', error);
    return NextResponse.json({ error: 'Failed to get country sentiment' }, { status: 500 });
  }
}
