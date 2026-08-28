import { describe, expect, test } from 'bun:test';
import {
  iso8601DurationSeconds,
  labelFromTitle,
  lengthBucketOf,
  publishSlotOf,
  videoIdOf,
} from '../src/youtube.js';

describe('labelFromTitle heuristics', () => {
  test('question titles get the question hook', () => {
    expect(labelFromTitle('Why does nobody talk about this?').hookType).toBe('question');
  });

  test('numbered lists get number_list + list + text-dominant thumbnail', () => {
    const l = labelFromTitle('7 things I stopped doing as a solo dev');
    expect(l.hookType).toBe('number_list');
    expect(l.format).toBe('list');
    expect(l.thumbnailArchetype).toBe('text_dominant');
  });

  test('how-to titles become tutorial + claim', () => {
    const l = labelFromTitle('How to ship a hackathon in 48 hours');
    expect(l.format).toBe('tutorial');
    expect(l.hookType).toBe('claim');
  });

  test('personal experiments become story cold opens + vlog', () => {
    const l = labelFromTitle('I tried posting every day for 30 days');
    expect(l.hookType).toBe('story_cold_open');
    expect(l.format).toBe('vlog');
  });

  test('vs/review titles become contrarian commentary', () => {
    const l = labelFromTitle('Foundry vs Hardhat: which one to learn');
    expect(l.hookType).toBe('contrarian');
    expect(l.format).toBe('commentary');
  });

  test('interviews are detected', () => {
    expect(labelFromTitle('Interview with a full-time builder').format).toBe('interview');
  });

  test('case and whitespace do not matter', () => {
    expect(labelFromTitle('  HOW TO USE FOUNDRY  ?').format).toBe('tutorial');
  });
});

describe('lengthBucketOf', () => {
  const cases: Array<[number, string]> = [
    [0, 'under_60s'],
    [59, 'under_60s'],
    [60, '1_4m'],
    [239, '1_4m'],
    [240, '4_10m'],
    [599, '4_10m'],
    [600, '10_20m'],
    [1199, '10_20m'],
    [1200, '20m_plus'],
    [7200, '20m_plus'],
  ];
  for (const [sec, want] of cases) {
    test(`${sec}s → ${want}`, () => {
      expect(lengthBucketOf(sec) as string).toBe(want);
    });
  }
});

describe('publishSlotOf', () => {
  test('weekday morning (Wed 09:00 UTC)', () => {
    expect(publishSlotOf(new Date('2026-08-26T09:00:00Z'))).toBe('weekday_am');
  });
  test('weekday afternoon (Wed 14:00 UTC)', () => {
    expect(publishSlotOf(new Date('2026-08-26T14:00:00Z'))).toBe('weekday_pm');
  });
  test('weekday evening (Wed 20:00 UTC)', () => {
    expect(publishSlotOf(new Date('2026-08-26T20:00:00Z'))).toBe('weekday_late');
  });
  test('weekend morning (Sat 07:00 UTC)', () => {
    expect(publishSlotOf(new Date('2026-08-29T07:00:00Z'))).toBe('weekend_am');
  });
  test('weekend afternoon (Sun 15:00 UTC)', () => {
    expect(publishSlotOf(new Date('2026-08-30T15:00:00Z'))).toBe('weekend_pm');
  });
});

describe('iso8601DurationSeconds', () => {
  test('parses PT#H#M#S forms', () => {
    expect(iso8601DurationSeconds('PT1H2M3S')).toBe(3723);
    expect(iso8601DurationSeconds('PT5M')).toBe(300);
    expect(iso8601DurationSeconds('PT45S')).toBe(45);
    expect(iso8601DurationSeconds('P0D')).toBe(0);
  });
});

describe('videoIdOf', () => {
  test('extracts 11-char ids from watch URLs and shares', () => {
    expect(videoIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(videoIdOf('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(videoIdOf('not a url')).toBeNull();
  });
});