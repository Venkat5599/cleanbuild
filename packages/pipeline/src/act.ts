/**
 * The act step (FR-6) and the Canon Gate (FR-7).
 *
 * This is the other half of the loop. Maturation (learn.ts) closes the
 * feedback cycle; this module opens the next one by proposing briefs drawn
 * from the posterior, then checking each proposal against the creator's canon
 * before it is surfaced.
 *
 * Two correctness properties are structural:
 *
 *   C2  ONE posterior draw per decision round. sampleTheta is called once,
 *       and every candidate in the round is scored against that single
 *       draw. Drawing per candidate is not Thompson sampling — it is argmax
 *       over independent noise, and it destroys the exploration guarantee.
 *
 *   The gate is deterministic TypeScript, not a prompt. A rate limit or a
 *   contradiction check implemented as an LLM instruction is not a limit or a
 *   check; these rules must hold regardless of what any model thinks.
 */

import {
  DIMENSIONS,
  FEATURE_NAMES,
  FORMATS,
  HOOK_TYPES,
  LENGTH_BUCKETS,
  PUBLISH_SLOTS,
  THUMBNAIL_ARCHETYPES,
  createRng,
  encode,
  featureIndex,
  marginal,
  predictedLift,
  predictiveVariance,
  sampleTheta,
  type FeatureLabels,
  type Posterior,
  type RNG,
} from '@ratchet/core';
import {
  getCreator,
  getPosterior,
  getFeatureLabels,
  insertBrief,
  insertGateEvent,
  listClaims,
  listPosts,
  setBriefStatus,
  setClaimEmbedding,
  type Db,
} from '@ratchet/db';
import { systemClock, type Clock } from './learn.js';
import { cosine, embedConfigured, embedTexts, type EmbedConfig } from './embed.js';

/** A hook may not be proposed again inside this window. */
export const HOOK_COOLDOWN_MS = 14 * 86_400_000;
/** A feature whose P(helps) has fallen this low is ruled out, not suggested. */
export const DEAD_FORMAT_PROB = 0.2;
/** Candidate briefs per decision round. */
export const ROUND_CANDIDATES = 8;
/** A round tries at most this many candidates before settling on a block. */
export const MAX_GATE_ATTEMPTS = 3;
/** Token-set overlap above this with a canon claim blocks the draft. */
export const CONTRADICTION_OVERLAP = 0.5;
/** Cosine similarity with a claim embedding above this blocks the draft. */
export const EMBEDDING_BLOCK_COSINE = 0.8;

export type GateRule = 'contradiction' | 'hook_cooldown' | 'dead_format' | 'embedding';

export interface GateEventView {
  rule: GateRule;
  verdict: 'pass' | 'block';
  explanation: string;
}

export interface ActResult {
  briefId: number;
  headline: string;
  labels: FeatureLabels;
  isExploratory: boolean;
  predictedLift: number;
  ciLow: number;
  ciHigh: number;
  stance: 'proposed' | 'blocked';
  gateEvents: GateEventView[];
}

// ------------------------------------------------------------------ drafting

/** Humanised level names so a brief reads like a creative decision, not JSON. */
const LEVEL_WORDS: Record<string, string> = {
  question: 'a question-based opener',
  claim: 'a strong claim upfront',
  number_list: 'a numbered list opener',
  story_cold_open: 'a cold-open story',
  contrarian: 'a contrarian take',
  demo_first: 'the payoff shown first',
  under_60s: 'under 60 seconds',
  '1_4m': '1-4 minutes',
  '4_10m': '4-10 minutes',
  '10_20m': '10-20 minutes',
  '20m_plus': '20+ minutes',
  face_reaction: 'a face-reaction thumbnail',
  text_dominant: 'a text-dominant thumbnail',
  object_hero: 'an object-hero thumbnail',
  before_after: 'a before/after thumbnail',
  none: 'no thumbnail portrait',
  weekday_am: 'weekday mornings',
  weekday_pm: 'weekday afternoons',
  weekday_late: 'weekday evenings',
  weekend_am: 'weekend mornings',
  weekend_pm: 'weekend afternoons',
  tutorial: 'tutorial',
  commentary: 'commentary',
  vlog: 'vlog',
  interview: 'interview',
  list: 'list format',
  shorts: 'shorts',
};

export function headlineOf(labels: FeatureLabels): string {
  const parts: string[] = [];
  const { hookType, lengthBucket, thumbnailArchetype, publishSlot, format, topicCluster } = labels;
  const sentence = `Make a ${LEVEL_WORDS[format] ?? format} with ${LEVEL_WORDS[hookType] ?? hookType}, ${LEVEL_WORDS[thumbnailArchetype] ?? thumbnailArchetype}, ${LEVEL_WORDS[lengthBucket] ?? lengthBucket}, posted ${LEVEL_WORDS[publishSlot] ?? publishSlot}, around topic cluster ${topicCluster + 1}.`;
  parts.push(sentence);
  return sentence;
}

interface Candidate {
  labels: FeatureLabels;
  /** One-hot vector. */
  x: Float64Array;
  /** Score under the round's single theta draw. */
  score: number;
  /** x' Sigma x — high means the model does not know this corner yet. */
  variance: number;
}

/**
 * Build the round's candidate set, all scored against ONE theta draw (C2).
 *
 * The base candidate is the argmax level of each dimension under theta (the
 * greedy best guess). The other candidates replace progressively lower-ranked
 * alternatives so the round spans the action space instead of collapsing onto
 * a single combination — that spread is what exploration is for.
 */
export function candidatesForRound(p: Posterior, theta: Float64Array): Candidate[] {
  // Argmax level index per dimension under this draw.
  const best = DIMENSIONS.map((dim) => {
    let bi = 0;
    let bs = -Infinity;
    for (let j = 0; j < dim.levels.length; j++) {
      const s = theta[featureIndex(dim.name, dim.levels[j] as string)]!;
      if (s > bs) {
        bs = s;
        bi = j;
      }
    }
    return bi;
  });

  const levelAt = (dimIndex: number, rank: number): string => {
    const dim = DIMENSIONS[dimIndex]!;
    return dim.levels[(best[dimIndex]! + rank) % dim.levels.length]! as string;
  };

  const out: Candidate[] = [];
  for (let i = 0; i < ROUND_CANDIDATES; i++) {
    // Candidate 0 is the pure greedy argmax. The rest each vary ONE
    // dimension away from it (rank 1, sometimes 2), so the round spans the
    // action space instead of collapsing into the greedy corner. Varying a
    // single dimension is deliberate: it lets a dead format or a repeated
    // hook be escaped without abandoning everything else the model prefers.
    let hookRank = 0;
    let lengthRank = 0;
    let thumbRank = 0;
    let slotRank = 0;
    let formatRank = 0;
    if (i === 1 || i === 4 || i === 7) hookRank = i === 7 ? 2 : 1;
    if (i === 2) lengthRank = 1;
    if (i === 5) thumbRank = 1;
    if (i === 3 || i === 6) slotRank = i === 6 ? 2 : 1;

    const labels: FeatureLabels = {
      hookType: levelAt(0, hookRank) as FeatureLabels['hookType'],
      lengthBucket: levelAt(1, lengthRank) as FeatureLabels['lengthBucket'],
      thumbnailArchetype: levelAt(2, thumbRank) as FeatureLabels['thumbnailArchetype'],
      publishSlot: levelAt(3, slotRank) as FeatureLabels['publishSlot'],
      format: levelAt(4, formatRank) as FeatureLabels['format'],
      topicCluster: (best[5]! + i) % 8,
    };
    const x = encode(labels);
    out.push({
      labels,
      x,
      score: dot(theta, x),
      variance: predictiveVariance(p, x),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

// --------------------------------------------------------------------- gate

/** Stopwords plus the template words headlineOf injects into every draft. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'this', 'that',
  'make', 'posted', 'around', 'cluster', 'opener', 'take', 'strong',
  'shown', 'lists', 'your', 'are', 'was', 'were', 'will', 'would',
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Jaccard overlap between two token sets. */
function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let cap = 0;
  for (const t of sa) if (sb.has(t)) cap++;
  return cap / new Set([...sa, ...sb]).size;
}

export interface GateInput {
  db: Db;
  creatorId: number;
  briefId: number;
  headline: string;
  labels: FeatureLabels;
  posterior: Posterior;
  now: Date;
  /**
   * Optional OpenAI-compatible embeddings config. When set, an additional
   * gate rule blocks drafts whose semantic similarity to a canon claim
   * clears EMBEDDING_BLOCK_COSINE. When unset, rule 4 does not run.
   */
  embedCfg?: EmbedConfig | undefined;
  /** Injectable fetch for the embedding rule (unit tests only). */
  embedFetch?: typeof fetch | undefined;
}

/**
 * Run the canon rules against a draft and record every verdict.
 *
 * Every rule writes a gate_event row with VERDICT 'pass' or 'block', so the
 * audit log shows the checks that ran, not only the ones that failed. A draft
 * is blocked (status flipped) if any rule blocks.
 */
export async function runGate(input: GateInput): Promise<GateEventView[]> {
  const { db, creatorId, briefId, headline, labels, posterior, now } = input;
  const events: GateEventView[] = [];

  // 1. dead format: any active feature the evidence has ruled out.
  const x = encode(labels);
  const dead: string[] = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 0) continue;
    const m = marginal(posterior, i);
    if (m.probPositive <= DEAD_FORMAT_PROB) dead.push(m.name);
  }
  if (dead.length > 0) {
    events.push({
      rule: 'dead_format',
      verdict: 'block',
      explanation: `P(helps) for ${dead.join(', ')} is at or below ${Math.round(DEAD_FORMAT_PROB * 100)}%; the evidence has ruled this out.`,
    });
  } else {
    events.push({ rule: 'dead_format', verdict: 'pass', explanation: 'no active feature is ruled out by the model.' });
  }

  // 2. hook cooldown: the same hook inside the window is a repeat, not a test.
  const cutoff = now.getTime() - HOOK_COOLDOWN_MS;
  let recentHook: string | null = null;
  const posts = await listPosts(db, creatorId);
  for (const post of posts) {
    if (post.publishedAt < cutoff) continue;
    const fl = await getFeatureLabels(db, post.id);
    if (fl && fl.hookType === labels.hookType) {
      recentHook = fl.hookType;
      break;
    }
  }
  if (recentHook) {
    events.push({
      rule: 'hook_cooldown',
      verdict: 'block',
      explanation: `hook "${recentHook}" was used within the last 14 days; repeating it would not test anything new.`,
    });
  } else {
    events.push({ rule: 'hook_cooldown', verdict: 'pass', explanation: 'hook is outside its cooldown window.' });
  }

  // 3. contradiction: lexical overlap with something the creator has said.
  let clash: string | null = null;
  for (const claim of await listClaims(db, creatorId)) {
    if (overlap(tokens(headline), tokens(claim.text)) >= CONTRADICTION_OVERLAP) {
      clash = claim.text;
      break;
    }
  }
  if (clash) {
    events.push({
      rule: 'contradiction',
      verdict: 'block',
      explanation: `draft overlaps the recorded stance "${clash}" — surface it as a decision about that claim, not a new claim.`,
    });
  } else {
    events.push({ rule: 'contradiction', verdict: 'pass', explanation: 'no conflict with the canon.' });
  }

  // 4. embedding similarity (only when EMBEDDING_* is configured): a draft
  //    can contradict the canon without sharing a single token. Claims are
  //    embedded lazily and persisted to the claims table, so each claim is
  //    embedded once per lifetime, not once per round. An infra failure must
  //    not disable the rule silently — it is recorded in the audit row.
  if (embedConfigured(input.embedCfg ?? {})) {
    try {
      const claims = await listClaims(db, creatorId);
      if (claims.length > 0) {
        const vectors = new Map<number, number[]>();
        const needEmbed: Array<{ id: number; text: string }> = [];
        for (const claim of claims) {
          if (claim.embedding && claim.embedding.length > 0) {
            vectors.set(claim.id, Array.from(claim.embedding));
          } else {
            needEmbed.push({ id: claim.id, text: claim.text });
          }
        }
        if (needEmbed.length > 0) {
          const fresh = await embedTexts(input.embedCfg!, needEmbed.map((c) => c.text), input.embedFetch);
          for (let i = 0; i < needEmbed.length; i++) {
            const emb = fresh[i] ?? [];
            vectors.set(needEmbed[i]!.id, emb);
            if (emb.length > 0) await setClaimEmbedding(db, needEmbed[i]!.id, new Float64Array(emb));
          }
        }
        const headVec = (await embedTexts(input.embedCfg!, [headline], input.embedFetch))[0] ?? [];
        let closestId: number | null = null;
        let closestSim = -1;
        for (const [id, vec] of vectors) {
          const sim = cosine(headVec, vec);
          if (sim > closestSim) {
            closestId = id;
            closestSim = sim;
          }
        }
        if (closestId !== null && closestSim >= EMBEDDING_BLOCK_COSINE) {
          const claim = claims.find((c) => c.id === closestId);
          events.push({
            rule: 'embedding',
            verdict: 'block',
            explanation: `draft is semantically close to the recorded stance "${claim?.text ?? `#${closestId}`}" (cosine ${closestSim.toFixed(2)} ≥ ${EMBEDDING_BLOCK_COSINE}) — surface it as a decision about that claim, not a new claim.`,
          });
        } else {
          events.push({
            rule: 'embedding',
            verdict: 'pass',
            explanation: `no embedded claim is within ${EMBEDDING_BLOCK_COSINE} cosine of the draft${closestId !== null ? ` (closest ${closestSim.toFixed(2)})` : ''}.`,
          });
        }
      } else {
        events.push({ rule: 'embedding', verdict: 'pass', explanation: 'canon has no recorded claims to compare.' });
      }
    } catch (err) {
      events.push({
        rule: 'embedding',
        verdict: 'pass',
        explanation: `embedding check unavailable (${err instanceof Error ? err.message : String(err)}); token-overlap rule still applies.`,
      });
    }
  }

  // Persist every verdict. The audit log is the product here: the /gate page
  // renders these rows, and a blocked draft's explanation is its value.
  for (const e of events) {
    await insertGateEvent(db, { briefId, rule: e.rule, verdict: e.verdict, explanation: e.explanation });
  }

  return events;
}

// ------------------------------------------------------------------ the act

function rationaleOf(p: Posterior, labels: FeatureLabels): string {
  const x = encode(labels);
  const active: Array<{ name: string; abs: number }> = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 0) continue;
    active.push({ name: FEATURE_NAMES[i]!, abs: Math.abs(p.mu[i]!) });
  }
  active.sort((a, b) => b.abs - a.abs);
  const top = active.slice(0, 3).map((a) => a.name);
  return `Scores highest under the current posterior draw; the deciding features are ${top.join(', ')}.`;
}

export interface GenerateOptions {
  clock?: Clock;
  /** Deterministic. Every round with the same seed replays identically. */
  seed?: number;
  /** Force a specific draft (used by tests and the gate demo). */
  labels?: FeatureLabels;
  /** Override the generated headline (used to construct a contradiction). */
  headlineOverride?: string;
  /** Enables the embedding contradiction rule for this round. */
  embedCfg?: EmbedConfig | undefined;
  /** Injectable fetch for the embedding rule (unit tests only). */
  embedFetch?: typeof fetch | undefined;
}

/**
 * One decision round: draw theta once, build and rank candidates, apply the
 * exploration budget, then pass the chosen draft through the canon gate.
 *
 * Every attempt is written to the briefs table — a blocked draft is an audit
 * row on the /gate page, not a silent discard. Returns the surfaced (or
 * blocked) brief and the gate events that decided it.
 */
export async function generateBrief(
  db: Db,
  creatorId: number,
  opts: GenerateOptions = {},
): Promise<ActResult> {
  const clock = opts.clock ?? systemClock;
  const creator = await getCreator(db, creatorId);
  if (!creator) throw new Error(`unknown creator ${creatorId}`);
  const posterior = await getPosterior(db, creatorId);
  if (!posterior) throw new Error('no posterior for this creator — run verification first');

  const rng = createRng(opts.seed ?? 0);
  const theta = sampleTheta(posterior, rng);
  const candidates = opts.labels
    ? [
        {
          labels: opts.labels,
          x: encode(opts.labels),
          score: dot(theta, encode(opts.labels)),
          variance: predictiveVariance(posterior, encode(opts.labels)),
        },
      ]
    : candidatesForRound(posterior, theta);

  const var75 = quantile(candidates.map((c) => c.variance), 0.75);
  const firstGreedy = candidates.find((c) => c.variance <= var75) ?? candidates[0]!;

  const attempts = Math.min(MAX_GATE_ATTEMPTS, candidates.length);
  let last: ActResult | null = null;

  for (let i = 0; i < attempts; i++) {
    const candidate = candidates[i]!;
    const isExploratory = candidate.variance > var75;
    // Budget rule: at most ~(100*explorationBudget)% of surfaced briefs may
    // be exploratory. The draw decides per round; the rate is the cap.
    const exploratoryAlloc = rng.next() < creator.explorationBudget;
    const proceed = isExploratory ? exploratoryAlloc : true;

    const probe = proceed ? candidate : firstGreedy;
    const lift = predictedLift(posterior, probe.x);
    const headline = opts.headlineOverride ?? headlineOf(probe.labels);
    const briefId = await insertBrief(db, {
      creatorId,
      headline,
      features: probe.labels,
      predictedLift: lift.mean,
      ciLow: lift.ciLow,
      ciHigh: lift.ciHigh,
      rationale: rationaleOf(posterior, probe.labels),
      isExploratory: isExploratory && proceed,
    });

    const gateEvents = await runGate({
      db,
      creatorId,
      briefId,
      headline,
      labels: probe.labels,
      posterior,
      now: clock.now(),
      embedCfg: opts.embedCfg,
      embedFetch: opts.embedFetch,
    });
    const blocked = gateEvents.some((e) => e.verdict === 'block');
    if (blocked) await setBriefStatus(db, briefId, 'blocked');

    last = {
      briefId,
      headline,
      labels: probe.labels,
      isExploratory: isExploratory && proceed,
      predictedLift: lift.mean,
      ciLow: lift.ciLow,
      ciHigh: lift.ciHigh,
      stance: blocked ? 'blocked' : 'proposed',
      gateEvents,
    };
    if (!blocked) break;
  }

  return last!;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx]!;
}