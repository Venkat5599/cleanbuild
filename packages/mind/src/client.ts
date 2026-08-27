/**
 * Minds Builder API client.
 *
 * Deliberately a thin fetch wrapper rather than the official
 * `@animocabrands/minds-client-lib`: this runs inside a Cloudflare Worker,
 * where the dependency surface matters and the SSE/EventSource paths in the
 * official library are not needed. The paths below were verified against the
 * live API on 2026-08-27 (and against the library's own dist):
 *
 *   GET  /v1/humans/{humanId}/minds            list Minds on the account
 *   POST /v1/messaging/conversation            { alias, mindId }
 *   POST /v1/messaging/message                 { alias, messageText }
 *   GET  /v1/messaging/histories/{alias}       transcript, newest last
 *   GET  /v1/minds/{mindId}/cognition/usage    cognition balance
 *
 * What the Builder API is, and what it is NOT:
 *   IS   messaging to and from a Mind, plus skill/app equip and Bazaar catalog
 *   NOT  a memory CRUD API
 *
 * A Mind's memory lives inside its Soul. There is no endpoint to write a fact
 * into it. You talk to the Mind and it remembers. That is why RATCHET's
 * autonomous path is `sendMessage` rather than a memory write: the worker pokes
 * the Mind, the Mind reasons with its own persistent context and follows up
 * with the creator on its own channel.
 */

export const MINDS_API_BASE = 'https://api.build.hellominds.ai';
export const MINDS_API_KEY_HEADER = 'X-Api-Key';

/** The key is a JWT; the humanId claim is what Minds belong to. */
export function parseHumanIdFromKey(apiKey: string): string | null {
  try {
    const payload = apiKey.split('.')[1];
    const json = JSON.parse(atob(payload!.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.humanId === 'string' ? json.humanId : null;
  } catch {
    return null;
  }
}

export class MindsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'MindsApiError';
  }

  /** 429 and 5xx are worth retrying; 4xx generally is not. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export interface BuilderMind {
  mindId: string;
  name?: string | null;
  email?: string | null;
  hasTelegram?: boolean;
  telegramBotId?: string | null;
}

export interface MessageRecord {
  fingerprint: string;
  conversationId?: string;
  messageText?: string | null;
  createdAt?: string;
  /** 0 or 2 = the Mind, 1 = a human. */
  senderType?: number | null;
  senderName?: string | null;
  subject?: string | null;
}

export interface CognitionBalance {
  mindId: string;
  cognition: number;
}

export interface MindsClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Per-request timeout. Workers cap total CPU, so this stays short. */
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export class MindsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly doFetch: typeof fetch;

  constructor(opts: MindsClientOptions) {
    if (!opts.apiKey) throw new Error('MINDS_BUILDER_API_KEY is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? MINDS_API_BASE).replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const init: RequestInit = {
          method: opts.method ?? 'GET',
          headers: {
            [MINDS_API_KEY_HEADER]: this.apiKey,
            ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          },
          signal: controller.signal,
        };
        // Assigned conditionally rather than passed as `undefined`, which
        // `exactOptionalPropertyTypes` correctly rejects.
        if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

        const res = await this.doFetch(`${this.baseUrl}${path}`, init);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // The key is a JWT. Never echo the response body into logs without
          // knowing what is in it, and never log the key itself.
          const err = new MindsApiError(
            res.status,
            `http_${res.status}`,
            `Minds API ${opts.method ?? 'GET'} ${path} failed: ${res.status} ${text.slice(0, 200)}`,
            res.headers.get('x-request-id') ?? undefined,
          );
          if (err.retryable && attempt < this.maxRetries) {
            lastError = err;
            await backoff(attempt);
            continue;
          }
          throw err;
        }

        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      } catch (e) {
        if (e instanceof MindsApiError) throw e;
        lastError = e;
        if (attempt < this.maxRetries) {
          await backoff(attempt);
          continue;
        }
        throw new MindsApiError(0, 'network', `Minds API request failed: ${String(e)}`);
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  listMinds(humanId?: string): Promise<BuilderMind[]> {
    const id = humanId ?? parseHumanIdFromKey(this.apiKey);
    if (!id) throw new Error('cannot determine humanId — pass it explicitly');
    return this.request<BuilderMind[]>(`/v1/humans/${encodeURIComponent(id)}/minds`);
  }

  getMind(mindId: string): Promise<BuilderMind> {
    return this.request<BuilderMind>(`/v1/minds/${encodeURIComponent(mindId)}`);
  }

  getCognitionUsage(mindId: string): Promise<CognitionBalance> {
    return this.request<CognitionBalance>(
      `/v1/minds/${encodeURIComponent(mindId)}/cognition/usage`,
    );
  }

  /**
   * Send a message into a conversation.
   *
   * This is the autonomous path. The cron worker calls it with no human in the
   * loop; the Mind receives it, reasons against its own persistent memory, and
   * decides how and whether to reach the creator.
   */
  sendMessage(alias: string, messageText: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/v1/messaging/message', {
      method: 'POST',
      body: { alias, messageText },
    });
  }

  /** Conversation transcript, newest last. Backs the continuity check. */
  getHistory(alias: string, limit = 20): Promise<MessageRecord[]> {
    return this.request<MessageRecord[]>(
      `/v1/messaging/histories/${encodeURIComponent(alias)}?limit=${limit}`,
    );
  }

  ensureConversation(alias: string, mindId: string): Promise<{ conversationId: string }> {
    return this.request<{ conversationId: string }>('/v1/messaging/conversation', {
      method: 'POST',
      body: { alias, mindId },
    });
  }
}

/** Exponential backoff with jitter, capped. */
async function backoff(attempt: number): Promise<void> {
  const base = Math.min(2000 * 2 ** attempt, 8000);
  const jitter = Math.random() * 250;
  await new Promise((r) => setTimeout(r, base + jitter));
}

/** A message is from the Mind when senderType is 0 or 2 (1 is a human). */
export function isFromMind(m: MessageRecord): boolean {
  return m.senderType === 0 || m.senderType === 2;
}
