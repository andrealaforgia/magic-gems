import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

const { createInteractionState, handleKey } = loadMagicGems([
  new URL('../../src/interaction.js', import.meta.url),
]);

const SPACE = ' '; // KeyboardEvent.key for the space bar in real browsers is ' ', not 'Space'

test('initial state has a cursor and no selection or target', () => {
  const state = createInteractionState();
  assert.deepEqual(state.cursor, { row: 0, col: 0 });
  assert.equal(state.selection, null);
  assert.equal(state.target, null);
});

test('an arrow key moves the cursor one cell in that direction when no selection is active', () => {
  const state = createInteractionState();
  const next = handleKey(state, 'ArrowRight');
  assert.deepEqual(next.cursor, { row: 0, col: 1 });
  assert.equal(next.selection, null);

  const next2 = handleKey(next, 'ArrowDown');
  assert.deepEqual(next2.cursor, { row: 1, col: 1 });

  const next3 = handleKey(next2, 'ArrowUp');
  assert.deepEqual(next3.cursor, { row: 0, col: 1 });

  const next4 = handleKey(next3, 'ArrowLeft');
  assert.deepEqual(next4.cursor, { row: 0, col: 0 });
});

test('an arrow key that would move the cursor off the top-left edge leaves it unchanged', () => {
  const state = createInteractionState(); // cursor starts at (0,0)
  const next = handleKey(state, 'ArrowUp');
  assert.strictEqual(next, state);

  const next2 = handleKey(state, 'ArrowLeft');
  assert.strictEqual(next2, state);
});

test('an arrow key that would move the cursor off the bottom-right edge leaves it unchanged', () => {
  let state = createInteractionState();
  for (let i = 0; i < 7; i++) state = handleKey(state, 'ArrowDown');
  for (let i = 0; i < 7; i++) state = handleKey(state, 'ArrowRight');
  assert.deepEqual(state.cursor, { row: 7, col: 7 });

  const next = handleKey(state, 'ArrowDown');
  assert.strictEqual(next, state);

  const next2 = handleKey(state, 'ArrowRight');
  assert.strictEqual(next2, state);
});

test('SPACE with no selection active selects the gem under the cursor', () => {
  const moved = handleKey(handleKey(createInteractionState(), 'ArrowRight'), 'ArrowDown');
  const next = handleKey(moved, SPACE);
  assert.deepEqual(next.selection, { row: 1, col: 1 });
  assert.equal(next.target, null);
});

test('with a selection active, an arrow key toward an adjacent cell designates the target', () => {
  const selected = handleKey(createInteractionState(), SPACE);
  const next = handleKey(selected, 'ArrowRight');
  assert.deepEqual(next.selection, { row: 0, col: 0 });
  assert.deepEqual(next.target, { row: 0, col: 1 });
});

test('with a selection on the edge, an arrow key pointing off the board designates no target', () => {
  const selected = handleKey(createInteractionState(), SPACE); // selection at (0,0), top-left corner
  const next = handleKey(selected, 'ArrowUp');
  assert.strictEqual(next, selected);
});

test('once a target is designated, an arrow key off the board leaves the existing target unchanged', () => {
  const withTarget = handleKey(handleKey(createInteractionState(), SPACE), 'ArrowRight');
  const next = handleKey(withTarget, 'ArrowUp');
  assert.strictEqual(next, withTarget);
});

test('a further arrow key while a target exists re-designates the target relative to the selection', () => {
  const withTarget = handleKey(handleKey(createInteractionState(), SPACE), 'ArrowRight');
  const next = handleKey(withTarget, 'ArrowDown');
  assert.deepEqual(next.selection, { row: 0, col: 0 });
  assert.deepEqual(next.target, { row: 1, col: 0 });
});

test('ESC clears an active selection and target, leaving only the cursor at that cell', () => {
  const withTarget = handleKey(handleKey(createInteractionState(), SPACE), 'ArrowRight');
  const next = handleKey(withTarget, 'Escape');
  assert.equal(next.selection, null);
  assert.equal(next.target, null);
  assert.deepEqual(next.cursor, { row: 0, col: 0 });
});

test('ESC with no active selection is a no-op', () => {
  const state = createInteractionState();
  const next = handleKey(state, 'Escape');
  assert.strictEqual(next, state);
});

test('an unrecognized key leaves the state unchanged', () => {
  const state = createInteractionState();
  const next = handleKey(state, 'a');
  assert.strictEqual(next, state);
});

test('an unrecognized key while a selection is active does not cancel it (only Escape does)', () => {
  const selected = handleKey(createInteractionState(), SPACE);
  const next = handleKey(selected, 'a');
  assert.strictEqual(next, selected);
});

test('SPACE while a selection is already active is a no-op (swap commit is out of scope)', () => {
  const selected = handleKey(createInteractionState(), SPACE);
  const next = handleKey(selected, SPACE);
  assert.strictEqual(next, selected);
});

test('the literal word "Space" is not a recognized key (real browsers report the space bar as a single space character)', () => {
  const state = createInteractionState();
  const next = handleKey(state, 'Space');
  assert.strictEqual(next, state);
});
