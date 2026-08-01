(function (global) {
  'use strict';

  const { hasMatch, applySwap, resolveCascade, ensurePlayable, handleKey } = global.MagicGems;

  function cancelToCursor(selectionCell) {
    return { cursor: { ...selectionCell }, selection: null, target: null };
  }

  function commit(board, interaction) {
    const { selection, target } = interaction;
    const swapped = applySwap(board, selection, target);
    const nextInteraction = cancelToCursor(selection);
    const matched = hasMatch(swapped);
    const swapAnimation = { a: selection, b: target, preSwapBoard: board, matched };

    if (!matched) {
      return { board, interaction: nextInteraction, swapAnimation, steps: [], revived: false, changedCells: [] };
    }

    const { board: settled, steps } = resolveCascade(swapped);
    const { board: playable, changedCells } = ensurePlayable(settled);
    return { board: playable, interaction: nextInteraction, swapAnimation, steps, revived: changedCells.length > 0, changedCells };
  }

  // SPEC 14.3: while the overlay is open, only Y/N are acted on - every other
  // key (including the ones that would otherwise move the cursor or select) is
  // a pure no-op, which is what "suspended" means at this state-machine level.
  function handleExitConfirmKey(gameState, key) {
    const { board, interaction } = gameState;
    if (key === 'y' || key === 'Y') {
      return { board, interaction, exitConfirmOpen: false, exitRequested: true, swapAnimation: null, steps: [] };
    }
    if (key === 'n' || key === 'N') {
      return { board, interaction, exitConfirmOpen: false, exitRequested: false, swapAnimation: null, steps: [] };
    }
    return { board, interaction, exitConfirmOpen: true, exitRequested: false, swapAnimation: null, steps: [] };
  }

  function handleGameKey(gameState, key) {
    const { board, interaction, exitConfirmOpen } = gameState;
    if (exitConfirmOpen) {
      return handleExitConfirmKey(gameState, key);
    }
    // SPEC 6.6/14.1: ESC backs out one level - cancels an active selection, or
    // (with none active) opens the exit confirmation instead of doing nothing.
    if (key === 'Escape' && !interaction.selection) {
      return { board, interaction, exitConfirmOpen: true, exitRequested: false, swapAnimation: null, steps: [] };
    }
    if (key === ' ' && interaction.selection && interaction.target) {
      return { ...commit(board, interaction), exitConfirmOpen: false, exitRequested: false };
    }
    return { board, interaction: handleKey(interaction, key), exitConfirmOpen: false, exitRequested: false, swapAnimation: null, steps: [] };
  }

  global.MagicGems.handleGameKey = handleGameKey;
})(typeof window !== 'undefined' ? window : globalThis);
