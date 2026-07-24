import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { FRAME_COUNT, FRAME_DURATION_MS, phaseOffsetFrames, currentFrameIndex } = loadMagicGems([
  new URL('../../src/spin.js', import.meta.url),
]);

test('FRAME_COUNT matches the shipped 15-frame rotation sequence', () => {
  assert.equal(FRAME_COUNT, 15);
});

// SPEC 9.1.1 (updated, SG2-SPEED): a lively idle turn, roughly one full rotation
// every 1.5 seconds - deliberately decoupled from 9.3's slower transition pace.
const TARGET_ROTATION_MS = 1500;
const ROTATION_TOLERANCE_MS = 150;

test('a full rotation cycle takes roughly 1.5 seconds (SPEC 9.1.1)', () => {
  const rotationMs = FRAME_DURATION_MS * FRAME_COUNT;
  assert.ok(
    Math.abs(rotationMs - TARGET_ROTATION_MS) <= ROTATION_TOLERANCE_MS,
    `expected a full rotation to take about ${TARGET_ROTATION_MS}ms, took ${rotationMs}ms`
  );
});

test('currentFrameIndex always returns a value within the valid frame range', () => {
  for (let elapsedMs = 0; elapsedMs < 20000; elapsedMs += 137) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const frame = currentFrameIndex(elapsedMs, row, col);
        assert.ok(frame >= 0 && frame < FRAME_COUNT, `frame ${frame} out of range at elapsed=${elapsedMs}`);
      }
    }
  }
});

test('currentFrameIndex advances by exactly one frame per FRAME_DURATION_MS, with no skips', () => {
  const row = 2;
  const col = 5;
  let previous = currentFrameIndex(0, row, col);
  for (let step = 1; step <= FRAME_COUNT * 3; step++) {
    const current = currentFrameIndex(step * FRAME_DURATION_MS, row, col);
    assert.equal(current, (previous + 1) % FRAME_COUNT, `expected a single-frame advance at step ${step}`);
    previous = current;
  }
});

test('currentFrameIndex wraps from the last frame back to the first with no special-cased jump', () => {
  const row = 0;
  const col = 0;
  const lastFrameElapsed = (FRAME_COUNT - 1 - phaseOffsetFrames(row, col) + FRAME_COUNT) % FRAME_COUNT * FRAME_DURATION_MS;
  assert.equal(currentFrameIndex(lastFrameElapsed, row, col), FRAME_COUNT - 1);
  assert.equal(currentFrameIndex(lastFrameElapsed + FRAME_DURATION_MS, row, col), 0);
});

test('within a single FRAME_DURATION_MS window, the frame never advances more than once', () => {
  const row = 3;
  const col = 3;
  const start = currentFrameIndex(1000, row, col);
  for (let dt = 1; dt < FRAME_DURATION_MS; dt += 17) {
    const advanced = currentFrameIndex(1000 + dt, row, col);
    assert.ok(advanced === start || advanced === (start + 1) % FRAME_COUNT, 'frame jumped by more than one step within a single frame window');
  }
});

test('phaseOffsetFrames gives different cells different starting phases (not lockstep)', () => {
  const offsets = new Set();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      offsets.add(phaseOffsetFrames(row, col));
    }
  }
  assert.ok(offsets.size > 1, 'expected more than one distinct phase across the board');
});

test('at elapsed=0, different cells already show different frames (out of phase from a fresh load)', () => {
  const frames = new Set();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      frames.add(currentFrameIndex(0, row, col));
    }
  }
  assert.ok(frames.size > 1, 'expected multiple distinct frames on the board at t=0');
});

test('at a fixed later moment, sampled cells are still out of phase with one another', () => {
  const frames = new Set();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      frames.add(currentFrameIndex(12345, row, col));
    }
  }
  assert.ok(frames.size > 1, 'expected multiple distinct frames across the board at a later moment');
});

test('at elapsed=0, a cell shows exactly its own phase offset as the starting frame', () => {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      assert.equal(currentFrameIndex(0, row, col), phaseOffsetFrames(row, col));
    }
  }
});
