(function (global) {
  'use strict';

  const CELL_SIZE = 64;
  const BOARD_SIZE = 8;

  function boot() {
    const { generateBoard, drawBoard, drawInteraction, createInteractionState, handleKey } =
      global.MagicGems;
    const canvas = document.getElementById('board');
    canvas.width = BOARD_SIZE * CELL_SIZE;
    canvas.height = BOARD_SIZE * CELL_SIZE;

    const ctx = canvas.getContext('2d');
    const board = generateBoard();
    let interaction = createInteractionState();

    function render() {
      drawBoard(ctx, board, CELL_SIZE);
      drawInteraction(ctx, interaction, CELL_SIZE);
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
