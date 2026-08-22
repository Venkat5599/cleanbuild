/**
 * Consolidation and retrieval.
 *
 * Consolidation is the step that turns episodes into beliefs. It runs nightly,
 * reads the posterior, and writes one semantic fact per feature the model has
 * an opinion about, each citing the experiments that produced it.
 *
 * Retrieval is the read path: given what the Mind is about to do, assemble the
 * few facts that actually bear on it, ranked, and format them as a block the
 * Mind can ground in. The ranking exists because an agent handed its entire
 * memory reasons worse than one handed the relevant six lines.
 */

import { marginals, type Posterior } from '@ratchet/core';
import {
  assertValid,
  entityId,
  type EntityId,
  type Fact,
  type Tier,
} from './ontology.js';

// ------------------------------------------------------------ consolidation

export interface ConsolidateInput {
  creatorId: number;
  posterior: Posterior;
  /** Experiment ids that fed the posterior. Becomes the provenance chain. */
  experimentIds: number[];
  /** Previously stored beliefs, so this run supersedes rather than duplicates. */
  existing?: Fact[];
  now?: number;
}

/**
 * Only features the model has a real opinion about become beliefs.
 *
 * A weight sitting at 50/50 is not knowledge, and writing it down as one would
 * fill memory with noise that outnumbers the signal. The threshold is
 * deliberately loose: 65% is "worth mentioning", not "settled".
 */
export const BELIEF_THRESHOLD = 0.65;

export function consolidate(input: ConsolidateInput): Fact[] {
  const { creatorId, posterior, experimentIds, existing = [], now = Date.now() } = input;

  const derivedFrom: EntityId[] = experimentIds.map((id) => entityId('Experiment', id));
  const priorById = new Map(existing.map((f) => [f.id, f]));
  const out: Fact[] = [];

  for (const m of marginals(posterior)) {
    const strength = Math.max(m.probPositive, 1 - m.probPositive);
    if (strength < BELIEF_THRESHOLD) continue;

    const helps = m.mean >= 0;
    const id = `belief-${creatorId}-${m.name}`;
    const subject = entityId('Belief', `${creatorId}-${m.name}`);

    const fact: Fact = {
      id: `${id}-${now}`,
      tier: 'semantic',
      subject,
      statement:
        `${describeFeature(m.name)} ${helps ? 'helps' : 'hurts'} this audience ` +
        `(${(strength * 100).toFixed(0)}% confident, effect ${m.mean >= 0 ? '+' : ''}${m.mean.toFixed(2)} ` +
        `with a 95% interval of ${m.ciLow.toFixed(2)} to ${m.ciHigh.toFixed(2)})`,
      confidence: strength,
      data: {
        feature: m.name,
        mean: m.mean,
        sd: m.sd,
        ciLow: m.ciLow,
        ciHigh: m.ciHigh,
        probPositive: m.probPositive,
        nObs: posterior.nObs,
      },
      relations: [
        { from: subject, kind: 'BELONGS_TO', to: entityId('Creator', creatorId) },
        ...derivedFrom.slice(0, 50).map((e) => ({
          from: subject,
          kind: 'DERIVED_FROM' as const,
          to: e,
        })),
      ],
      provenance: {
        derivedFrom,
        // A deterministic computation, not a model's opinion. Recorded as such
        // so a reader can tell which facts were measured and which were judged.
        producer: 'posterior',
        observedAt: now,
      },
    };

    // Supersede rather than overwrite: the old belief stays readable, so "what
    // did it think last month, and what changed its mind" is answerable.
    const previous = [...priorById.values()].find(
      (f) => f.subject === subject && !f.supersededBy,
    );
    if (previous) {
      previous.supersededBy = fact.id;
      previous.supersededAt = now;
      fact.relations.push({ from: subject, kind: 'SUPERSEDES', to: previous.subject });
    }

    out.push(assertValid(fact));
  }

  return out;
}

/** "hook_type:question" reads badly in a sentence. */
function describeFeature(name: string): string {
  const [dimension, level] = name.split(':');
  const readable = (level ?? name).replace(/_/g, ' ');
  switch (dimension) {
    case 'hook_type':
      return `Opening with a ${readable} hook`;
    case 'length_bucket':
      return `Running ${readable}`;
    case 'thumbnail_archetype':
      return `A ${readable} thumbnail`;
    case 'publish_slot':
      return `Publishing ${readable.replace('weekday', 'on a weekday').replace('weekend', 'at the weekend')}`;
    case 'format':
      return `The ${readable} format`;
    case 'topic_cluster':
      return `Topic cluster ${readable.replace('topic ', '')}`;
    default:
      return readable;
  }
}

// ---------------------------------------------------------------- retrieval

export interface RetrievalQuery {
  creatorId: number;
  /** What the agent is about to do. Drives which facts are relevant. */
  intent: 'brief' | 'follow_up' | 'review' | 'gate';
  /** Feature names in play, if the intent concerns specific ones. */
  features?: string[];
  limit?: number;
  now?: number;
}

export interface RankedFact {
  fact: Fact;
  score: number;
  why: string;
}

const TIER_WEIGHT: Record<Tier, number> = {
  semantic: 1,
  procedural: 0.9,
  episodic: 0.6,
};

/**
 * Rank facts for a specific intent.
 *
 * Three signals, in order of importance: does it concern what we are about to
 * do, how confident is it, and how recent. Superseded facts are excluded
 * entirely; they remain in the store for audit but must never be handed to the
 * agent as current.
 */
export function retrieve(facts: Fact[], query: RetrievalQuery): RankedFact[] {
  const now = query.now ?? Date.now();
  const limit = query.limit ?? 8;
  const wanted = new Set(query.features ?? []);

  const ranked = facts
    .filter((f) => !f.supersededBy)
    .filter((f) => belongsTo(f, query.creatorId))
    .map((f) => {
      const reasons: string[] = [];
      let score = TIER_WEIGHT[f.tier];

      if (wanted.size > 0 && typeof f.data.feature === 'string' && wanted.has(f.data.feature)) {
        score += 1.5;
        reasons.push('concerns a feature in play');
      }

      score += f.confidence;
      if (f.confidence >= 0.9) reasons.push('high confidence');

      // Half-life of 60 days: an old belief still counts, but a fresh one that
      // says something different should outrank it.
      const ageDays = (now - f.provenance.observedAt) / 86_400_000;
      const recency = Math.pow(0.5, ageDays / 60);
      score += recency * 0.5;

      if (query.intent === 'gate' && f.data.kind === 'commitment') {
        score += 1.2;
        reasons.push('a public commitment, which the gate exists to protect');
      }
      if (query.intent === 'brief' && f.provenance.producer === 'posterior') {
        score += 0.8;
        reasons.push('a measured effect rather than an impression');
      }

      return { fact: f, score, why: reasons.join('; ') || 'general context' };
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit);
}

function belongsTo(fact: Fact, creatorId: number): boolean {
  if (fact.data.creatorId === creatorId) return true;
  return fact.relations.some(
    (r) => r.kind === 'BELONGS_TO' && r.to === entityId('Creator', creatorId),
  );
}

/**
 * Format retrieved facts for the Mind.
 *
 * Confidence and provenance are printed alongside every line, because an agent
 * that cannot tell a measurement from a guess will treat them the same.
 */
export function formatForMind(ranked: RankedFact[]): string {
  if (ranked.length === 0) return 'No relevant memory for this creator yet.';

  const lines = ['What is known about this creator, most relevant first:', ''];
  for (const { fact } of ranked) {
    const source = fact.provenance.producer === 'posterior' ? 'measured' : 'stated';
    lines.push(
      `- ${fact.statement} [${source}, ${(fact.confidence * 100).toFixed(0)}% confident, from ${fact.provenance.derivedFrom.length} source${fact.provenance.derivedFrom.length === 1 ? '' : 's'}]`,
    );
  }
  lines.push('');
  lines.push(
    'Facts marked "measured" come from a statistical model of closed experiments. Facts marked "stated" were extracted from what the creator published. Do not present either as more certain than its confidence.',
  );
  return lines.join('\n');
}
