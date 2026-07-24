import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { STUCK_BOARD } from './game.steps.js';

Then('exactly one cell was changed by the revive', async function () {
  assert.equal(this.revivedChangedCells.length, 1, `expected exactly one changed cell, got ${JSON.stringify(this.revivedChangedCells)}`);
});

Then('the live page\'s two-cell revive fallback finds a valid move with a minimal two-cell change', async function () {
  const result = await this.page.evaluate(
    (stuckBoard) => window.MagicGems.tryReviveTwoCells(stuckBoard),
    STUCK_BOARD
  );
  assert.ok(result, 'expected a two-cell revive to be found');
  assert.equal(result.changedCells.length, 2, 'expected a minimal two-cell change');
  const hasMatch = await this.page.evaluate((board) => window.MagicGems.hasMatch(board), result.board);
  const hasAnyValidMove = await this.page.evaluate((board) => window.MagicGems.hasAnyValidMove(board), result.board);
  assert.equal(hasMatch, false);
  assert.equal(hasAnyValidMove, true);
});
