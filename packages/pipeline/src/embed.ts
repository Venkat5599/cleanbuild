/**
 * Embeddings for the canon gate (FR-7.2).
 *
 * An OpenAI-compatible /embeddings client, configured purely by environment
 * (EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL). The request
 * shape was verified against a live OpenAI-compatible endpoint on 2026-08-27
 * ({ model, input } → Bearer auth). Until those variables are set this path
 * is inert and the gate's token-overlap rule is the whole contradiction
 * check — deliberate: a gate that depends on an unconfigured API must degrade
 * to its deterministic rule, never to silence.
 */

export interface EmbedConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export function embedConfigured(cfg: EmbedConfig): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.model);
}

export interface EmbedResponse {
  data: Array<{ embedding: number[] }>;
}

/**
 * Embed a batch of texts. Returns one vector per input, in order.
 * `fetchImpl` is injectable so the URL/body contract is unit-tested without
 * network.
 */
export async function embedTexts(
  cfg: EmbedConfig,
  inputs: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<number[][]> {
  if (!embedConfigured(cfg)) throw new Error('embeddings not configured (EMBEDDING_* env)');
  if (inputs.length === 0) return [];

  const res = await fetchImpl(`${cfg.baseUrl!.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: cfg.model, input: inputs }),
  });
  if (!res.ok) {
    throw new Error(`embeddings request failed with ${res.status}`);
  }
  const body = (await res.json()) as EmbedResponse;
  return body.data.map((d) => d.embedding);
}

/** Cosine similarity. Empty or all-zero vectors score 0. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}