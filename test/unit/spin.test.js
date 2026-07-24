import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMagicGems } from '../support/load-src.js';

const { FRAME_COUNT, reviveSpinFrameIndex } = loadMagicGems([
  new URL('../../src/spin.js', import.meta.url),
]);

test('FRAME_COUNT matches the shipped rotation sequence (15 frames per gem)', () => {
  assert.equal(FRAME_COUNT, 15);
});

test('reviveSpinFrameIndex starts on the face-on frame at progress 0', () => {
  assert.equal(reviveSpinFrameIndex(0), 0);
});

test('reviveSpinFrameIndex lands back on the face-on frame at progress 1 (SPEC 8.3.1: comes to rest static)', () => {
  assert.equal(reviveSpinFrameIndex(1), 0);
});

test('reviveSpinFrameIndex advances through the frame set as progress increases', () => {
  const seen = new Set();
  for (let i = 0; i <= 20; i++) {
    seen.add(reviveSpinFrameIndex(i / 20));
  }
  assert.ok(seen.size > 1, 'expected the spin to actually pass through more than one frame');
  for (const frame of seen) {
    assert.ok(frame >= 0 && frame < FRAME_COUNT, `frame ${frame} out of range`);
  }
});

test('reviveSpinFrameIndex completes at least one full rotation before progress 1', () => {
  // Two full rotations across [0,1) - by the midpoint it must already have swept
  // through the whole frame set once, not just crept partway through it.
  const midpointFrame = reviveSpinFrameIndex(0.5);
  assert.equal(midpointFrame, 0, 'expected exactly one full rotation to complete by the midpoint');
});

test('reviveSpinFrameIndex clamps progress outside [0,1]', () => {
  assert.equal(reviveSpinFrameIndex(-0.5), reviveSpinFrameIndex(0));
  assert.equal(reviveSpinFrameIndex(1.5), reviveSpinFrameIndex(1));
});
