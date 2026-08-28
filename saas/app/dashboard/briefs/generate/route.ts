import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API = process.env.RATCHET_API_URL ?? 'http://127.0.0.1:8787';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { rounds?: unknown } | null;
  const rounds = Math.min(3, Math.max(1, Number.isInteger(body?.rounds) ? (body!.rounds as number) : 3));
  try {
    const res = await fetch(`${API}/briefs/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rounds }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return NextResponse.json({ error: String(data.error ?? `HTTP ${res.status}`) }, { status: 502 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}