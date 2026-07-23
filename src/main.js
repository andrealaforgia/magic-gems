(function (global) {
  'use strict';

  const BOARD_SIZE = 8;

  function boot() {
    const {
      generateBoard,
      drawBoard,
      drawInteraction,
      createInteractionState,
      handleKey,
      computeCellSize,
    } = global.MagicGems;
    const canvas = document.getElementById('board');
    const cellSize = computeCellSize(window.innerWidth, window.innerHeight, BOARD_SIZE);
    canvas.width = BOARD_SIZE * cellSize;
    canvas.height = BOARD_SIZE * cellSize;

    const ctx = canvas.getContext('2d');
    const board = generateBoard();
    let interaction = createInteractionState();

    function render() {
      drawBoard(ctx, board, cellSize);
      drawInteraction(ctx, interaction, cellSize);
    }

    render();

    document.addEventListener('keydown', (event) => {
      const next = handleKey(interaction, event.key);
      if (next !== interaction) {
        interaction = next;
        render();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
