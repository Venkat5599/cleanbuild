import { describe, expect, test } from 'bun:test';
import { cosine, embedConfigured, embedTexts } from '../src/embed.js';

describe('embedConfigured', () => {
  test('requires all three fields', () => {
    expect(embedConfigured({})).toBe(false);
    expect(embedConfigured({ baseUrl: 'x' })).toBe(false);
    expect(embedConfigured({ baseUrl: 'x', apiKey: 'y' })).toBe(false);
    expect(embedConfigured({ baseUrl: 'x', apiKey: 'y', model: 'z' })).toBe(true);
  });
});

describe('cosine', () => {
  test('identical vectors score 1', () => {
    expect(cosine([1, 0, 1], [1, 0, 1])).toBeCloseTo(1, 10);
  });

  test('orthogonal vectors score 0', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test('opposite vectors score -1', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  test('all-zero and empty vectors score 0, never NaN', () => {
    expect(cosine([0, 0], [0, 0])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });

  test('mismatched lengths score 0', () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });

  test('magnitude does not matter, only direction', () => {
    expect(cosine([2, 4], [1, 2])).toBeCloseTo(1, 10);
  });
});

describe('embedTexts', () => {
  const cfg = { baseUrl: 'https://emb.example/v1/', apiKey: 'k', model: 'm-x' };

  test('builds the verified request contract (POST /embeddings, Bearer auth, array input)', async () => {
    const seen: {
    url?: string | undefined;
    method?: string | undefined;
    auth?: string | undefined;
    body?: unknown;
  } = {};
    const fakeFetch = (url: string | URL | Request, init?: RequestInit) => {
      seen.url = String(url);
      seen.method = init?.method;
      seen.auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      seen.body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };

    const out = await embedTexts(cfg, ['alpha', 'beta'], fakeFetch as unknown as typeof fetch);

    expect(seen.url).toBe('https://emb.example/v1/embeddings');
    expect(seen.method).toBe('POST');
    expect(seen.auth).toBe('Bearer k');
    expect(seen.body).toEqual({ model: 'm-x', input: ['alpha', 'beta'] });
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  test('trailing slash on baseUrl is not doubled', async () => {
    const fakeFetch = () =>
      Promise.resolve(new Response(JSON.stringify({ data: [{ embedding: [1] }] }), { status: 200 }));
    const out = await embedTexts({ ...cfg, baseUrl: 'https://emb.example/v1' }, ['a'], fakeFetch as unknown as typeof fetch);
    expect(out).toEqual([[1]]);
  });

  test('throws when not configured', async () => {
    const fakeFetch = () => Promise.resolve(new Response('{}', { status: 200 }));
    await expect(
      embedTexts({ apiKey: 'k' }, ['a'], fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow('not configured');
  });

  test('throws on non-2xx and surfaces the status', async () => {
    const fakeFetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }),
      );
    await expect(
      embedTexts(cfg, ['a'], fakeFetch as unknown as typeof fetch),
    ).rejects.toThrow('failed with 404');
  });

  test('empty input returns immediately without a request', async () => {
    const fakeFetch = () => {
      throw new Error('should not be called');
    };
    expect(await embedTexts(cfg, [], fakeFetch as unknown as typeof fetch)).toEqual([]);
  });
});