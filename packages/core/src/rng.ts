/**
 * Seeded RNG.
 *
 * Thompson sampling is stochastic, so every draw in RATCHET goes through an
 * injectable seeded generator. Without this the demo is not reproducible and
 * the posterior tests are flaky — both are unacceptable.
 */

export interface RNG {
  /** Uniform on [0, 1). */
  next(): number;
  /** Standard normal. */
  normal(): number;
}

/** mulberry32 — small, fast, good enough for sampling. */
export function createRng(seed: number): RNG {
  let a = seed >>> 0;
  let spare: number | null = null;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = (): number => {
    // Marsaglia polar method, caching the spare deviate.
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u: number, v: number, s: number;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return u * mul;
  };

  return { next, normal };
}
