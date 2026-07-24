(function (global) {
  'use strict';

  const { computeSpriteDrawRect, GEM_SPRITE_FIT_RATIO } = global.MagicGems;

  function drawGem(ctx, gem, cx, cy, cellSize, sprites) {
    const sprite = sprites[gem];
    const rect = computeSpriteDrawRect(
      sprite.naturalWidth,
      sprite.naturalHeight,
      cx,
      cy,
      cellSize,
      GEM_SPRITE_FIT_RATIO
    );
    ctx.drawImage(sprite, rect.x, rect.y, rect.width, rect.height);
  }

  function drawBoard(ctx, board, cellSize, sprites, hiddenCells) {
    const size = board.length;
    ctx.clearRect(0, 0, size * cellSize, size * cellSize);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (hiddenCells && hiddenCells.has(`${row},${col}`)) continue;
        const gem = board[row][col];
        if (gem === null) continue;
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        drawGem(ctx, gem, cx, cy, cellSize, sprites);
      }
    }
  }

  const HIGHLIGHT_RING_INSET = 3;
  const HIGHLIGHT_RING_LINE_WIDTH = 3;
  const HIGHLIGHT_COLORS = Object.freeze({
    cursor: '#ffffff',
    selection: '#00e5a8',
    target: '#ff7a00',
  });

  function drawHighlightRing(ctx, row, col, cellSize, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = HIGHLIGHT_RING_LINE_WIDTH;
    const inset = HIGHLIGHT_RING_INSET;
    ctx.strokeRect(
      col * cellSize + inset,
      row * cellSize + inset,
      cellSize - 2 * inset,
      cellSize - 2 * inset
    );
    ctx.restore();
  }

  function drawInteraction(ctx, interaction, cellSize) {
    if (interaction.selection) {
      drawHighlightRing(
        ctx,
        interaction.selection.row,
        interaction.selection.col,
        cellSize,
        HIGHLIGHT_COLORS.selection
      );
      if (interaction.target) {
        drawHighlightRing(
          ctx,
          interaction.target.row,
          interaction.target.col,
          cellSize,
          HIGHLIGHT_COLORS.target
        );
      }
    } else {
      drawHighlightRing(
        ctx,
        interaction.cursor.row,
        interaction.cursor.col,
        cellSize,
        HIGHLIGHT_COLORS.cursor
      );
    }
  }

  // Large enough that a cropped sliver of real sprite art is still legible as a
  // piece of that gem (SPEC 9.2.2), not just a coloured speck.
  const FRAGMENT_SIZE = 10;

  function drawFragments(ctx, fragments) {
    for (const fragment of fragments) {
      ctx.drawImage(
        fragment.sprite,
        fragment.sx,
        fragment.sy,
        fragment.sw,
        fragment.sh,
        fragment.x - FRAGMENT_SIZE / 2,
        fragment.y - FRAGMENT_SIZE / 2,
        FRAGMENT_SIZE,
        FRAGMENT_SIZE
      );
    }
  }

  global.MagicGems.drawGem = drawGem;
  global.MagicGems.drawBoard = drawBoard;
  global.MagicGems.drawInteraction = drawInteraction;
  global.MagicGems.drawFragments = drawFragments;
  global.MagicGems.HIGHLIGHT_COLORS = HIGHLIGHT_COLORS;
  global.MagicGems.HIGHLIGHT_RING_INSET = HIGHLIGHT_RING_INSET;
  global.MagicGems.FRAGMENT_SIZE = FRAGMENT_SIZE;
})(typeof window !== 'undefined' ? window : globalThis);
