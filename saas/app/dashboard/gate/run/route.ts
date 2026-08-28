import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API = process.env.RATCHET_API_URL ?? 'http://127.0.0.1:8787';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.headline !== 'string' || body.headline.trim().length < 4) {
    return NextResponse.json({ error: 'paste a draft headline of at least 4 characters' }, { status: 400 });
  }
  try {
    const res = await fetch(`${API}/gate/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline: body.headline, labels: body.labels ?? null }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return NextResponse.json({ error: String(data.error ?? `HTTP ${res.status}`) }, { status: 502 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}