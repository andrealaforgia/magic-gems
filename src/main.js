(function (global) {
  'use strict';

  const CELL_SIZE = 64;
  const BOARD_SIZE = 8;

  function boot() {
    const { generateBoard, drawBoard } = global.MagicGems;
    const canvas = document.getElementById('board');
    canvas.width = BOARD_SIZE * CELL_SIZE;
    canvas.height = BOARD_SIZE * CELL_SIZE;

    const ctx = canvas.getContext('2d');
    const board = generateBoard();
    drawBoard(ctx, board, CELL_SIZE);
  }

  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
