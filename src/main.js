(function (global) {
  'use strict';

  const BOARD_SIZE = 8;

  function boot() {
    const {
      generateBoard,
      drawBoard,
      drawInteraction,
      drawFragments,
      createInteractionState,
      handleGameKey,
      computeCellSize,
      ensurePlayable,
      createFragments,
      updateFragments,
      pruneOffscreen,
      GEM_COLORS,
    } = global.MagicGems;
    const canvas = document.getElementById('board');
    const cellSize = computeCellSize(window.innerWidth, window.innerHeight, BOARD_SIZE);
    canvas.width = BOARD_SIZE * cellSize;
    canvas.height = BOARD_SIZE * cellSize;

    const ctx = canvas.getContext('2d');
    let board = ensurePlayable(generateBoard());
    let interaction = createInteractionState();
    let fragments = [];

    function render() {
      drawBoard(ctx, board, cellSize);
      drawInteraction(ctx, interaction, cellSize);
      drawFragments(ctx, fragments);
    }

    render();

    function spawnFragments(clearEvents) {
      for (const { row, col, gemType } of clearEvents) {
        const centerX = col * cellSize + cellSize / 2;
        const centerY = row * cellSize + cellSize / 2;
        fragments = fragments.concat(createFragments(centerX, centerY, GEM_COLORS[gemType]));
      }
    }

    let lastFrameTimeMs = null;

    function tick(frameTimeMs) {
      if (fragments.length > 0) {
        if (lastFrameTimeMs !== null) {
          const dtSeconds = (frameTimeMs - lastFrameTimeMs) / 1000;
          fragments = pruneOffscreen(updateFragments(fragments, dtSeconds), canvas.height);
          render();
        }
        lastFrameTimeMs = frameTimeMs;
      } else {
        lastFrameTimeMs = null;
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    document.addEventListener('keydown', (event) => {
      const next = handleGameKey({ board, interaction }, event.key);
      if (next.board !== board || next.interaction !== interaction) {
        board = next.board;
        interaction = next.interaction;
        spawnFragments(next.clearEvents);
        render();
      }
    });

    // Observability seam for tests: the shatter animation is real, time-based state
    // that isn't otherwise reachable from outside this closure. Exposes the live
    // fragment list (not a copy) so tests can wait for it to settle or inspect it.
    global.MagicGems.getActiveFragments = () => fragments;
  }

  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
