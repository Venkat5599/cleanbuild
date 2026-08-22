/**
 * The creator ontology.
 *
 * A typed vocabulary for everything RATCHET can know, so memory is a structured
 * graph rather than a pile of sentences. The point is not formalism for its own
 * sake: it is that a fact you can type is a fact you can contradict, supersede,
 * and trace back to its cause. A free-text memory can only be appended to.
 *
 * Three tiers, borrowed from the standard cognitive split, because they have
 * genuinely different lifetimes and write rules:
 *
 *   EPISODIC    what happened, once, at a time. Immutable. An experiment
 *               closed; a message was sent; a brief was blocked.
 *   SEMANTIC    what is believed to be true in general. DERIVED from episodes,
 *               never asserted directly, and superseded rather than edited.
 *   PROCEDURAL  how to act. Policies and thresholds. Changes rarely, and every
 *               change is attributable to a person or a rule.
 *
 * The hard rule this file exists to enforce: a semantic fact must carry
 * provenance to the episodes that produced it. A belief with no evidence behind
 * it is exactly the hallucination this architecture is meant to prevent.
 */

export const ONTOLOGY_VERSION = 1;

// ---------------------------------------------------------------- entities

export type EntityKind =
  | 'Creator'
  | 'Audience'
  | 'Post'
  | 'Experiment'
  | 'Feature'
  | 'Belief'
  | 'Claim'
  | 'Bit'
  | 'Brief'
  | 'Policy'
  | 'Notification';

/** Stable identity. `kind:localId` so ids are self-describing in logs. */
export type EntityId = `${EntityKind}:${string}`;

export function entityId(kind: EntityKind, local: string | number): EntityId {
  return `${kind}:${local}` as EntityId;
}

export function parseEntityId(id: EntityId): { kind: EntityKind; local: string } {
  const i = id.indexOf(':');
  return { kind: id.slice(0, i) as EntityKind, local: id.slice(i + 1) };
}

// --------------------------------------------------------------- relations

/**
 * Relations are directed and closed. Adding one is a deliberate act, because
 * an open relation vocabulary degenerates into free text within a week.
 */
export type RelationKind =
  | 'PUBLISHED' // Creator  -> Post
  | 'TESTED' // Experiment -> Feature
  | 'MEASURED_BY' // Post -> Experiment
  | 'SUPPORTS' // Experiment -> Belief
  | 'WEAKENS' // Experiment -> Belief
  | 'DERIVED_FROM' // Belief -> Experiment  (provenance, mandatory)
  | 'SUPERSEDES' // Belief -> Belief
  | 'CONTRADICTS' // Claim -> Claim
  | 'STATED_IN' // Claim -> Post
  | 'PROPOSES' // Brief -> Feature
  | 'BLOCKED_BY' // Brief -> Policy
  | 'TRIGGERED' // Belief -> Notification
  | 'BELONGS_TO'; // anything -> Creator

export interface Relation {
  from: EntityId;
  kind: RelationKind;
  to: EntityId;
}

// -------------------------------------------------------------------- tiers

export type Tier = 'episodic' | 'semantic' | 'procedural';

/** Which tier a fact about each entity kind lives in. */
export const TIER_OF: Record<EntityKind, Tier> = {
  Creator: 'semantic',
  Audience: 'semantic',
  Post: 'episodic',
  Experiment: 'episodic',
  Notification: 'episodic',
  Feature: 'semantic',
  Belief: 'semantic',
  Claim: 'semantic',
  Bit: 'semantic',
  Brief: 'episodic',
  Policy: 'procedural',
};

// -------------------------------------------------------------------- facts

export interface Provenance {
  /** Episodes this fact was derived from. Required for semantic facts. */
  derivedFrom: EntityId[];
  /** What produced the fact. `posterior` means a deterministic computation. */
  producer: 'posterior' | 'mind' | 'ingest' | 'operator' | 'policy';
  observedAt: number;
}

export interface Fact {
  id: string;
  tier: Tier;
  subject: EntityId;
  /** The claim itself, in a form the Mind can read aloud. */
  statement: string;
  /**
   * How much weight to give it, 0..1.
   *
   * For a belief this is the posterior's own probability, not a guess. That
   * matters: a confidence the model invented would be indistinguishable from
   * one it measured, and only one of those is worth acting on.
   */
  confidence: number;
  /** Structured payload for machine use; `statement` is the human form. */
  data: Record<string, unknown>;
  relations: Relation[];
  provenance: Provenance;
  /** Set when a later fact supersedes this one. Never deleted. */
  supersededBy?: string;
  supersededAt?: number;
}

// --------------------------------------------------------------- validation

export interface ValidationError {
  field: string;
  problem: string;
}

const RELATION_DOMAIN: Record<RelationKind, { from: EntityKind[]; to: EntityKind[] }> = {
  PUBLISHED: { from: ['Creator'], to: ['Post'] },
  TESTED: { from: ['Experiment'], to: ['Feature'] },
  MEASURED_BY: { from: ['Post'], to: ['Experiment'] },
  SUPPORTS: { from: ['Experiment'], to: ['Belief'] },
  WEAKENS: { from: ['Experiment'], to: ['Belief'] },
  DERIVED_FROM: { from: ['Belief'], to: ['Experiment'] },
  SUPERSEDES: { from: ['Belief'], to: ['Belief'] },
  CONTRADICTS: { from: ['Claim'], to: ['Claim'] },
  STATED_IN: { from: ['Claim'], to: ['Post'] },
  PROPOSES: { from: ['Brief'], to: ['Feature'] },
  BLOCKED_BY: { from: ['Brief'], to: ['Policy'] },
  TRIGGERED: { from: ['Belief'], to: ['Notification'] },
  BELONGS_TO: {
    from: ['Post', 'Experiment', 'Belief', 'Claim', 'Bit', 'Brief', 'Policy', 'Notification'],
    to: ['Creator'],
  },
};

/**
 * Reject a malformed fact at the boundary rather than storing it and
 * discovering the problem when the Mind reads something incoherent.
 */
export function validateFact(fact: Fact): ValidationError[] {
  const errors: ValidationError[] = [];

  const subjectKind = parseEntityId(fact.subject).kind;
  if (!(subjectKind in TIER_OF)) {
    errors.push({ field: 'subject', problem: `unknown entity kind "${subjectKind}"` });
  } else if (TIER_OF[subjectKind] !== fact.tier) {
    errors.push({
      field: 'tier',
      problem: `${subjectKind} belongs to the ${TIER_OF[subjectKind]} tier, not ${fact.tier}`,
    });
  }

  if (fact.confidence < 0 || fact.confidence > 1 || !Number.isFinite(fact.confidence)) {
    errors.push({ field: 'confidence', problem: 'must be a number in [0, 1]' });
  }

  if (!fact.statement.trim()) {
    errors.push({ field: 'statement', problem: 'must be readable, not empty' });
  }

  // The rule this whole module exists for.
  if (fact.tier === 'semantic' && fact.provenance.derivedFrom.length === 0) {
    errors.push({
      field: 'provenance.derivedFrom',
      problem:
        'a semantic fact must cite the episodes it came from. A belief with no evidence behind it is a hallucination with extra steps.',
    });
  }

  for (const r of fact.relations) {
    const domain = RELATION_DOMAIN[r.kind];
    if (!domain) {
      errors.push({ field: 'relations', problem: `unknown relation "${r.kind}"` });
      continue;
    }
    const fromKind = parseEntityId(r.from).kind;
    const toKind = parseEntityId(r.to).kind;
    if (!domain.from.includes(fromKind)) {
      errors.push({
        field: 'relations',
        problem: `${r.kind} cannot start at ${fromKind}`,
      });
    }
    if (!domain.to.includes(toKind)) {
      errors.push({
        field: 'relations',
        problem: `${r.kind} cannot end at ${toKind}`,
      });
    }
  }

  return errors;
}

export function assertValid(fact: Fact): Fact {
  const errors = validateFact(fact);
  if (errors.length > 0) {
    throw new Error(
      `invalid fact ${fact.id}: ${errors.map((e) => `${e.field} ${e.problem}`).join('; ')}`,
    );
  }
  return fact;
}
