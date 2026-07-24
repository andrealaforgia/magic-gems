import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { cascadeToneIndex, CASCADE_TONE_COUNT, soundsForKeydown, soundsForCascadeStep } = loadMagicGems([
  new URL('../../src/audio-cues.js', import.meta.url),
]);

test('CASCADE_TONE_COUNT is the size of the provided ascending tone set', () => {
  assert.equal(CASCADE_TONE_COUNT, 4);
});

test('cascadeToneIndex returns the chain position directly within the tone set', () => {
  assert.equal(cascadeToneIndex(1), 1);
  assert.equal(cascadeToneIndex(2), 2);
  assert.equal(cascadeToneIndex(3), 3);
  assert.equal(cascadeToneIndex(4), 4);
});

test('cascadeToneIndex clamps at the top tone for chains deeper than the tone set (SPEC 11.2.6)', () => {
  assert.equal(cascadeToneIndex(5), 4);
  assert.equal(cascadeToneIndex(10), 4);
});

// soundsForKeydown

test('an arrow key that actually moved the cursor or re-aimed the target plays cursor-move', () => {
  const prev = { selection: null };
  const next = { swapAnimation: null, interaction: { selection: null } };
  assert.deepEqual(soundsForKeydown('ArrowRight', prev, next), ['cursor-move']);
});

test('SPACE that makes a fresh selection plays select', () => {
  const prev = { selection: null };
  const next = { swapAnimation: null, interaction: { selection: { row: 0, col: 0 } } };
  assert.deepEqual(soundsForKeydown(' ', prev, next), ['select']);
});

test('a redundant SPACE that changes nothing new (already selected) plays nothing', () => {
  const prev = { selection: { row: 0, col: 0 } };
  const next = { swapAnimation: null, interaction: { selection: { row: 0, col: 0 } } };
  assert.deepEqual(soundsForKeydown(' ', prev, next), []);
});

test('Escape has no dedicated cue, even when it actually cancelled a selection', () => {
  const prev = { selection: { row: 0, col: 0 } };
  const next = { swapAnimation: null, interaction: { selection: null } };
  assert.deepEqual(soundsForKeydown('Escape', prev, next), []);
});

test('a matched commit plays swap', () => {
  const prev = { selection: { row: 0, col: 0 } };
  const next = { swapAnimation: { matched: true }, reshuffled: false, interaction: {} };
  assert.deepEqual(soundsForKeydown(' ', prev, next), ['swap']);
});

test('an unmatched (reverted) commit plays invalid, not swap', () => {
  const prev = { selection: { row: 0, col: 0 } };
  const next = { swapAnimation: { matched: false }, reshuffled: false, interaction: {} };
  assert.deepEqual(soundsForKeydown(' ', prev, next), ['invalid']);
});

test('a commit that leaves the board unplayable also plays reshuffle, after swap (SPEC 8.3)', () => {
  const prev = { selection: { row: 0, col: 0 } };
  const next = { swapAnimation: { matched: true }, reshuffled: true, interaction: {} };
  assert.deepEqual(soundsForKeydown(' ', prev, next), ['swap', 'reshuffle']);
});

// soundsForCascadeStep

test('a cascade step with falling/refilling gems plays shatter, its chain-position tone, drop, then score', () => {
  const step = { chainPosition: 2, fallEvents: [{ col: 0 }], refillEvents: [] };
  assert.deepEqual(soundsForCascadeStep(step), ['shatter', 'cascade-2', 'drop', 'score']);
});

test('a cascade step with refilling but no falling gems still plays drop', () => {
  const step = { chainPosition: 1, fallEvents: [], refillEvents: [{ col: 0 }] };
  assert.deepEqual(soundsForCascadeStep(step), ['shatter', 'cascade-1', 'drop', 'score']);
});

test('a cascade step with no falling or refilling gems skips drop', () => {
  const step = { chainPosition: 1, fallEvents: [], refillEvents: [] };
  assert.deepEqual(soundsForCascadeStep(step), ['shatter', 'cascade-1', 'score']);
});

test('a cascade step deep in a chain plays the clamped top tone (SPEC 11.2.6)', () => {
  const step = { chainPosition: 6, fallEvents: [], refillEvents: [] };
  assert.deepEqual(soundsForCascadeStep(step), ['shatter', 'cascade-4', 'score']);
});
