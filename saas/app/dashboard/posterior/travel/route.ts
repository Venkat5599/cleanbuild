import { NextRequest, NextResponse } from 'next/server';
import { getTimeTravel } from '@/lib/ratchet';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { fromWeek?: unknown; toWeek?: unknown } | null;
  const fromWeek = Number(body?.fromWeek);
  const toWeek = Number(body?.toWeek);
  if (!Number.isInteger(fromWeek) || !Number.isInteger(toWeek)) {
    return NextResponse.json({ error: 'expected fromWeek and toWeek' }, { status: 400 });
  }
  try {
    const travel = await getTimeTravel(fromWeek, toWeek);
    return NextResponse.json(travel);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}