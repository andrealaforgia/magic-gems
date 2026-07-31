import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { findHighlight } from './interaction.steps.js';

function pageFor(world, which) {
  return which === 'first' ? world.pageA : world.pageB;
}

const REMOTE_CANVAS_ID = 'match-remote-board';

// MP-SEQ-CURSOR/SPEC 13.4.5.2-13.4.5.3: reads the RECEIVING page's own remote
// canvas - the same pixel-level highlight reader single-player's local board
// already uses (interaction.steps.js), pointed at the multiplayer remote
// canvas instead - so this proves the opponent's cursor/selection/target are
// actually drawn on screen, not just present in the polled wire state.
async function waitForRemoteHighlight(page, type, row, col, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let found = [];
  do {
    found = await findHighlight(page, type, REMOTE_CANVAS_ID);
    if (found.length === 1 && found[0].row === row && found[0].col === col) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  assert.equal(
    found.length,
    1,
    `expected exactly one remote ${type} highlight at some point, last saw ${JSON.stringify(found)}`
  );
  assert.deepEqual(
    found[0],
    { row, col },
    `expected the remote ${type} highlight to reach cell ${row},${col}, last saw ${JSON.stringify(found[0])}`
  );
}

Then(
  "the {word} page's remote cursor highlight eventually is at cell {int},{int}",
  { timeout: 25000 },
  async function (which, row, col) {
    await waitForRemoteHighlight(pageFor(this, which), 'cursor', row, col);
  }
);

Then(
  "the {word} page's remote selection highlight eventually is at cell {int},{int}",
  { timeout: 25000 },
  async function (which, row, col) {
    await waitForRemoteHighlight(pageFor(this, which), 'selection', row, col);
  }
);

Then(
  "the {word} page's remote target highlight eventually is at cell {int},{int}",
  { timeout: 25000 },
  async function (which, row, col) {
    await waitForRemoteHighlight(pageFor(this, which), 'target', row, col);
  }
);
