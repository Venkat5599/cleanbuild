import { NextRequest, NextResponse } from 'next/server';
import { getFeatureExplain } from '@/lib/ratchet';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { feature?: unknown } | null;
  const feature = typeof body?.feature === 'string' ? body.feature : '';
  if (!feature) return NextResponse.json({ error: 'missing feature' }, { status: 400 });
  try {
    const explain = await getFeatureExplain(feature);
    return NextResponse.json(explain);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}