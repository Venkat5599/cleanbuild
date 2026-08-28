/**
 * The interactive sandbox — "Try the loop" for judges.
 *
 * The live ledger is read-only by design (nothing on the dashboard pages can
 * move a belief). The sandbox gives the visitor the product itself to
 * operate: publish a post with chosen creative features, fast-forward the
 * clock, watch checkpoints fill, the posterior update, and a brief be gated
 * or a notification delivered — all running the REAL pipeline code
 * (matureDueExperiments, runFollowUp, the canon gate) against an isolated
 * scratch database that is wiped on Reset.
 *
 * Honesty contract, mirrored in the UI:
 *  - The scratch ledger carries labelled synthetic history and the sandbox's
 *    metrics are simulated from the creator's own fitted baseline plus
 *    residual noise, biased by what the current posterior believes — always
 *    marked simulated, never claimed to be real platform data.
 *  - Deliveries use the real channels (Mind / Telegram) with the real rate
 *    limit from the notifications ledger; if none are configured the
 *    notification stays "stored".
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate as drizzleMigrate } from 'drizzle-orm/bun-sqlite/migrator';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import {
  CHECKPOINT_HOURS,
  advanceCheckpoint,
  checkpointFor,
  getCreator,
  getFeatureLabels,
  getPosterior,
  insertFeatures,
  insertPost,
  listExperiments,
  listNotifications,
  openExperiment,
  upsertMetrics,
  type Db,
} from '@ratchet/db';
import {
  FEATURE_SCHEMA_VERSION,
  createRng,
  encode,
  predictedLift,
  residualReward,
  type FeatureLabels,
} from '@ratchet/core';
import {
  confoundContexts,
  fitCreatorBaseline,
  matureDueExperiments,
  refitCreator,
  systemClock,
} from '@ratchet/pipeline';
import { headlineOf, generateBrief } from '@ratchet/pipeline';
import { MindsClient } from '@ratchet/mind';
import { seed } from '../../../scripts/seed-history.js';
import { fromFile } from '../../../packages/db/src/local.js';
import { runFollowUp } from './followup.js';

export interface SandboxEnv {
  MINDS_BUILDER_API_KEY?: string | undefined;
  MINDS_ALIAS?: string | undefined;
  TELEGRAM_BOT_TOKEN?: string | undefined;
  TELEGRAM_CHAT_ID?: string | undefined;
}

const MIGRATIONS = join(import.meta.dir, '..', '..', '..', 'packages', 'db', 'migrations');

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...data }));
}

/** One scratch database, reused across requests, wiped on Reset. */
export class Sandbox {
  private db: Db | null = null;

  constructor(
    private dbPath: string,
    private env: SandboxEnv,
  ) {}

  private async ensure(): Promise<Db> {
    if (this.db) return this.db;
    const exists = await Bun.file(this.dbPath).exists().catch(() => false);
    if (!exists) await this.init();
    this.db = fromFile(this.dbPath);
    return this.db;
  }

  private async init(): Promise<void> {
    for (const suffix of ['', '-wal', '-shm']) {
      await rm(`${this.dbPath}${suffix}`, { force: true });
    }
    const sqlite = new Database(this.dbPath, { create: true });
    sqlite.exec('PRAGMA foreign_keys = ON');
    drizzleMigrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS });
    sqlite.close();

    const db = fromFile(this.dbPath);
    await seed(db, {
      weeks: 10,
      postsPerWeek: 5,
      seed: 1337,
      handle: 'sandbox-creator',
      niche: 'making',
      dbPath: this.dbPath,
      endOffsetDays: 30,
      creators: 1,
      niches: ['making'],
    });
    await refitCreator(db, 1, systemClock);
    log('sandbox.init', { dbPath: this.dbPath });
  }

  async reset(): Promise<SandboxState> {
    this.db = null;
    for (const suffix of ['', '-wal', '-shm']) {
      await rm(`${this.dbPath}${suffix}`, { force: true });
    }
    await this.init();
    this.db = fromFile(this.dbPath);
    return this.state();
  }

  async publish(labels: FeatureLabels): Promise<{ postId: number; experimentId: number; title: string }> {
    const db = await this.ensure();
    const creator = await getCreator(db, 1);
    if (!creator) throw new Error('sandbox creator missing — reset the sandbox');
    const now = new Date();
    const title = headlineOf(labels).replace(/^Make a /, 'Sandbox: ');
    const { id: postId } = await insertPost(db, {
      creatorId: creator.id,
      platformPostId: `sb-${now.getTime()}`,
      publishedAt: now,
      title,
      description: 'Published in the interactive sandbox. Simulated ledger, real pipeline.',
      durationSeconds:
        { under_60s: 45, '1_4m': 150, '4_10m': 420, '10_20m': 900, '20m_plus': 1500 }[
          labels.lengthBucket
        ] ?? 420,
      followersAtPublish: creator.followers,
      raw: { sandbox: true, simulated: true },
    });
    await insertFeatures(db, postId, FEATURE_SCHEMA_VERSION, labels, encode(labels), 'sandbox');
    const experimentId = await openExperiment(db, postId, creator.id, now);
    return { postId, experimentId, title };
  }

  /**
   * Simulate the next 24h of cron: write metric rows for every checkpoint
   * that just came due (simulated views from the creator's fitted baseline,
   * biased by the posterior's own predicted lift for those features), close
   * experiments that reached 168h, then run the real follow-up.
   */
  async advance(): Promise<SandboxState> {
    const db = await this.ensure();
    const creator = await getCreator(db, 1);
    if (!creator) return this.state();

    const now = new Date();
    const model = await fitCreatorBaseline(db, creator.id, systemClock);
    const posterior = await getPosterior(db, creator.id);

    for (const exp of await listExperiments(db, creator.id, 20)) {
      if (!['open', 'maturing'].includes(exp.status)) continue;
      if (exp.nextCheckpointAt === null) continue;
      if (exp.nextCheckpointAt > now.getTime() + CHECKPOINT_HOURS['24h'] * 3_600_000) continue;

      const checkpoint = checkpointFor(exp.openedAt, exp.nextCheckpointAt);
      let targetSigma = 0;
      if (model) {
        const ctx = (await confoundContexts(db, creator.id)).get(exp.postId);
        const labels = await getFeatureLabels(db, exp.postId);
        const lift = posterior && labels ? predictedLift(posterior, encode(labels)).mean : 0;
        const rng = createRng(exp.postId);
        // Deterministic per experiment; biased by the model's current belief.
        // One roll in five is a genuine breakout (still under the ±4σ clip),
        // so the materiality gate is reachable from the sandbox.
        const roll = rng.next();
        targetSigma =
          roll < 0.2
            ? Math.min(3.9, Math.max(1.2, lift + 2.6 + rng.next() * 1.3))
            : Math.max(-2, Math.min(2, lift + roll * 3 - 1.5));
        if (ctx) {
          const { predictedLogViews, sigmaResid } = residualReward(1, model, ctx);
          const finalViews = Math.max(50, Math.round(Math.exp(predictedLogViews + targetSigma * sigmaResid)));
          const share = { '24h': 0.55, '72h': 0.8, '168h': 1 } as const;
          const s = share[checkpoint] ?? 1;
          await upsertMetrics(db, exp.postId, checkpoint, {
            views: Math.round(finalViews * s),
            watchTime: Math.round(finalViews * s * 480 * 0.38),
            comments: Math.round(finalViews * s * 0.005),
            likes: Math.round(finalViews * s * 0.06),
            followerDelta: Math.round(finalViews * s * 0.003),
          });
        }
      }

      // Stamp the next due time; at 168h the stamp is due immediately so the
      // maturation job below closes the experiment this tick.
      const NEXT_HOURS: Record<'24h' | '72h' | '168h', number> = { '24h': 72, '72h': 168, '168h': 168 };
      await advanceCheckpoint(
        db,
        exp.id,
        new Date(exp.openedAt + NEXT_HOURS[checkpoint] * 3_600_000),
      );
    }

    await matureDueExperiments(db, systemClock, 200);
    const minds =
      this.env.MINDS_BUILDER_API_KEY && this.env.MINDS_ALIAS
        ? new MindsClient({ apiKey: this.env.MINDS_BUILDER_API_KEY })
        : null;
    const telegram =
      this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_CHAT_ID
        ? { botToken: this.env.TELEGRAM_BOT_TOKEN, chatId: this.env.TELEGRAM_CHAT_ID }
        : null;
    await runFollowUp({ db, minds, mindAlias: this.env.MINDS_ALIAS ?? null, telegram, log });

    // Propose one brief so the judge sees the act step react too.
    try {
      await generateBrief(db, creator.id, { seed: 42 });
    } catch {
      // The brief step needs a posterior; it exists after the first advance.
    }

    return this.state();
  }

  async state(): Promise<SandboxState> {
    const db = await this.ensure();
    const creator = await getCreator(db, 1);
    if (!creator) {
      return { ready: false, experiments: [], notifications: [], posteriorN: 0 };
    }
    const posterior = await getPosterior(db, creator.id);
    const experiments = await listExperiments(db, creator.id, 20);
    const notifications = await listNotifications(db, 1, 5);
    return {
      ready: true,
      experiments: experiments.map((e) => ({
        id: e.id,
        postId: e.postId,
        status: e.status,
        openedAt: new Date(e.openedAt).toISOString(),
        nextCheckpointAt: e.nextCheckpointAt ? new Date(e.nextCheckpointAt).toISOString() : null,
      })),
      notifications: notifications.map((n) => ({
        channel: n.channel,
        body: (n.body ?? '').slice(0, 240),
        sentAt: n.sentAt ? new Date(n.sentAt).toISOString() : null,
      })),
      posteriorN: posterior?.nObs ?? 0,
    };
  }
}

export interface SandboxState {
  ready: boolean;
  experiments: Array<{
    id: number;
    postId: number;
    status: string;
    openedAt: string;
    nextCheckpointAt: string | null;
  }>;
  notifications: Array<{ channel: string; body: string; sentAt: string | null }>;
  posteriorN: number;
}