import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API = process.env.RATCHET_API_URL ?? 'http://127.0.0.1:8787';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { eventId?: unknown } | null;
  const eventId = Number(body?.eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: 'expected a gate event id' }, { status: 400 });
  }
  try {
    const res = await fetch(`${API}/gate/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return NextResponse.json({ error: String(data.error ?? `HTTP ${res.status}`) }, { status: 502 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}