(function (global) {
  'use strict';

  const { hasMatch, applySwap, resolveCascade, ensurePlayable, handleKey } = global.MagicGems;

  function cancelToCursor(selectionCell) {
    return { cursor: { ...selectionCell }, selection: null, target: null };
  }

  function commit(board, interaction) {
    const swapped = applySwap(board, interaction.selection, interaction.target);

    if (!hasMatch(swapped)) {
      return { board, interaction: cancelToCursor(interaction.selection), clearEvents: [] };
    }

    const { board: settled, clearEvents } = resolveCascade(swapped);
    return {
      board: ensurePlayable(settled),
      interaction: cancelToCursor(interaction.selection),
      clearEvents,
    };
  }

  function handleGameKey(gameState, key) {
    const { board, interaction } = gameState;
    if (key === ' ' && interaction.selection && interaction.target) {
      return commit(board, interaction);
    }
    return { board, interaction: handleKey(interaction, key), clearEvents: [] };
  }

  global.MagicGems.handleGameKey = handleGameKey;
})(typeof window !== 'undefined' ? window : globalThis);
