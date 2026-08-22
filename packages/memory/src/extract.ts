/**
 * Fact extraction.
 *
 * Turns raw creator material (post titles, descriptions, transcripts) into
 * typed candidate facts for the semantic tier. This is mechanical work:
 * spotting that a sentence is a durable public commitment rather than a passing
 * remark. It does not require judgement about the creator's strategy, so it is
 * done by a cheap fast model rather than spending the Mind's cognition on it.
 *
 * The division of labour is deliberate:
 *   this module   extracts and types candidates, cheaply, at volume
 *   the posterior derives beliefs from measured outcomes, deterministically
 *   the Mind      decides what any of it means and what to say about it
 *
 * Nothing extracted here is trusted on its own. Every candidate carries
 * provenance to the post it came from, and the caller decides whether to
 * persist it.
 */

import { entityId, type Fact, type Provenance } from './ontology.js';

export const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
export const DEFAULT_BASE_URL = 'https://aicredits.in/api/v1';

export interface ExtractorOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ClaimCandidate {
  text: string;
  /** How durable the statement is: a commitment, a preference, or an aside. */
  kind: 'commitment' | 'preference' | 'fact' | 'aside';
  confidence: number;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Minimal OpenAI-compatible client.
 *
 * Two details this provider requires that a naive client gets wrong:
 *
 * 1. The model reasons before answering, and the reasoning consumes the token
 *    budget. A small `max_tokens` returns `content: null` with the whole budget
 *    spent thinking, which looks like an API failure and is not. The floor
 *    below exists for that reason.
 * 2. `content` can legitimately be null. Callers must handle it rather than
 *    assuming a string.
 */
export class Extractor {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(opts: ExtractorOptions) {
    if (!opts.apiKey) throw new Error('an API key is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  private async chat(messages: ChatMessage[], maxTokens = 1500): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          // Generous, because reasoning tokens come out of this budget.
          max_tokens: Math.max(maxTokens, 800),
          temperature: 0,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`extraction request failed with ${res.status}`);
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      return body.choices?.[0]?.message?.content ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Pull durable public claims out of a post.
   *
   * Asides are extracted too, and labelled as such, so the caller can drop them
   * without the model having to make that call. Deciding what matters is the
   * Mind's job.
   */
  async extractClaims(post: {
    title: string;
    description?: string;
    transcript?: string;
  }): Promise<ClaimCandidate[]> {
    const source = [post.title, post.description, post.transcript]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000);

    const content = await this.chat([
      {
        role: 'system',
        content: [
          'You extract durable public claims from a creator\'s content.',
          'A claim is something the creator has committed to publicly and could later be held to, or contradict.',
          'Classify each: "commitment" (a promise or a stated rule they follow), "preference" (a taste they hold), "fact" (a verifiable statement about the world), "aside" (a passing remark not worth remembering).',
          'Return ONLY a JSON array. Each item: {"text": string, "kind": string, "confidence": number between 0 and 1}.',
          'Return [] if the content contains no claims. Do not invent claims that are not present.',
        ].join('\n'),
      },
      { role: 'user', content: source },
    ]);

    if (!content) return [];
    return parseJsonArray<ClaimCandidate>(content).filter(
      (c) =>
        typeof c.text === 'string' &&
        c.text.trim().length > 0 &&
        ['commitment', 'preference', 'fact', 'aside'].includes(c.kind),
    );
  }

  /**
   * Restate a set of belief movements as one sentence a person would say.
   *
   * The numbers are already computed; this only phrases them. It is explicitly
   * forbidden from adding a conclusion the numbers do not support, because a
   * summary that overstates the evidence is worse than no summary.
   */
  async narrateBeliefChange(input: {
    postTitle: string;
    reward: number;
    movements: Array<{ feature: string; delta: number; probPositive: number }>;
  }): Promise<string | null> {
    const content = await this.chat(
      [
        {
          role: 'system',
          content: [
            'You restate statistical belief updates in one plain sentence for a content creator.',
            'Use only the numbers given. Never claim more certainty than the probabilities support.',
            'If a probability is between 0.4 and 0.6, describe it as still unclear.',
            'No preamble, no markdown, one sentence.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
      900,
    );
    return content?.trim() ?? null;
  }
}

/**
 * Models wrap JSON in prose or fences no matter how firmly you ask them not to.
 * Recover the array rather than failing the whole extraction over formatting.
 */
function parseJsonArray<T>(raw: string): T[] {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Turn a candidate into a storable fact with provenance attached. */
export function claimToFact(
  candidate: ClaimCandidate,
  creatorId: number,
  postId: number,
  now = Date.now(),
): Fact {
  const provenance: Provenance = {
    derivedFrom: [entityId('Post', postId)],
    producer: 'mind',
    observedAt: now,
  };
  return {
    id: `claim-${postId}-${hash(candidate.text)}`,
    tier: 'semantic',
    subject: entityId('Claim', `${postId}-${hash(candidate.text)}`),
    statement: candidate.text,
    confidence: clamp01(candidate.confidence),
    data: { kind: candidate.kind, creatorId },
    relations: [
      {
        from: entityId('Claim', `${postId}-${hash(candidate.text)}`),
        kind: 'STATED_IN',
        to: entityId('Post', postId),
      },
      {
        from: entityId('Claim', `${postId}-${hash(candidate.text)}`),
        kind: 'BELONGS_TO',
        to: entityId('Creator', creatorId),
      },
    ],
    provenance,
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

/** Short stable hash, for deterministic ids. Not cryptographic. */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
