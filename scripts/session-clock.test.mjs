import assert from 'node:assert/strict';
import { test } from 'node:test';
import { elapsedMs, pauseClock, remainingSeconds, resumeClock } from '../src/lib/session-clock.ts';

const start = { startedAt: 10_000, durationSec: 100 };

test('existing sessions count down without requiring new stored fields', () => {
  assert.equal(elapsedMs(start, 30_000), 20_000);
  assert.equal(remainingSeconds(start, 30_000), 80);
  assert.equal(remainingSeconds(start, 30_001), 80);
  assert.equal(remainingSeconds(start, 200_000), 0);
});

test('pause freezes the clock after reload and while the browser is closed', () => {
  const paused = JSON.parse(JSON.stringify(pauseClock(start, 30_000)));
  assert.equal(remainingSeconds(paused, 40_000), 80);
  assert.equal(remainingSeconds(paused, 24 * 3600_000), 80);
  assert.equal(elapsedMs(paused, 24 * 3600_000), 20_000);
  assert.deepEqual(pauseClock(paused, 50_000), paused);
});

test('resuming excludes the complete pause, preserving answers and highlights', () => {
  const active = { ...start, answers: { q1: ['A'] }, highlights: { q1: ['Amazon S3'] }, idx: 3 };
  const resumed = resumeClock(pauseClock(active, 30_000), 130_000);
  assert.equal(resumed.pausedAt, undefined);
  assert.equal(resumed.pausedDurationMs, 100_000);
  assert.equal(remainingSeconds(resumed, 130_000), 80);
  assert.equal(remainingSeconds(resumed, 140_000), 70);
  assert.equal(elapsedMs(resumed, 140_000), 30_000);
  assert.deepEqual(resumed.answers, active.answers);
  assert.deepEqual(resumed.highlights, active.highlights);
  assert.equal(resumed.idx, 3);
});

test('multiple pauses accumulate and an expired exam cannot be paused', () => {
  let clock = resumeClock(pauseClock(start, 30_000), 130_000);
  clock = resumeClock(pauseClock(clock, 140_000), 240_000);
  assert.equal(clock.pausedDurationMs, 200_000);
  assert.equal(remainingSeconds(clock, 250_000), 60);
  assert.equal(remainingSeconds(clock, 310_000), 0);
  assert.equal(pauseClock(clock, 310_000), clock);
  assert.equal(resumeClock(clock, 320_000), clock);
});
