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
      return { board, interaction: nextInteraction, swapAnimation, steps: [] };
    }

    const { board: settled, steps } = resolveCascade(swapped);
    return { board: ensurePlayable(settled), interaction: nextInteraction, swapAnimation, steps };
  }

  function handleGameKey(gameState, key) {
    const { board, interaction } = gameState;
    if (key === ' ' && interaction.selection && interaction.target) {
      return commit(board, interaction);
    }
    return { board, interaction: handleKey(interaction, key), swapAnimation: null, steps: [] };
  }

  global.MagicGems.handleGameKey = handleGameKey;
})(typeof window !== 'undefined' ? window : globalThis);
