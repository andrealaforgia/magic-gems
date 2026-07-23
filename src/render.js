(function (global) {
  'use strict';

  const { GEM_COLORS } = global.MagicGems;

  const GLOW_BLUR_RATIO = 0.15;
  const GEM_RADIUS_RATIO = 0.3;

  function pathFor(gem, cx, cy, r) {
    const path = new Path2D();
    switch (gem) {
      case 'purple-triangle':
        // Apex and base equidistant from centre (SPEC 3.3: centred both axes).
        path.moveTo(cx, cy - r);
        path.lineTo(cx + r * 0.87, cy + r);
        path.lineTo(cx - r * 0.87, cy + r);
        path.closePath();
        break;
      case 'red-square':
        path.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
        break;
      case 'green-circle':
      case 'white-circle':
        path.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
        break;
      case 'yellow-diamond':
        // Equilateral diamond: a rhombus with 4 equal sides (a square rotated 45deg),
        // symmetric on both axes (SPEC 2.4, 3.3).
        path.moveTo(cx, cy - r);
        path.lineTo(cx + r, cy);
        path.lineTo(cx, cy + r);
        path.lineTo(cx - r, cy);
        path.closePath();
        break;
      case 'blue-diamond':
        // Cut-gemstone silhouette pointing down: flat "table" top edge, angled
        // shoulder facets, sharp pavilion point at bottom. Bounding box spans -r to
        // +r on both axes, so it's centred (SPEC 3.3) while staying visually distinct
        // from yellow's plain equilateral rhombus (SPEC 2.5).
        path.moveTo(cx - r * 0.5, cy - r);
        path.lineTo(cx + r * 0.5, cy - r);
        path.lineTo(cx + r, cy - r * 0.15);
        path.lineTo(cx, cy + r);
        path.lineTo(cx - r, cy - r * 0.15);
        path.closePath();
        break;
      default:
        throw new Error(`Unknown gem type: ${gem}`);
    }
    return path;
  }

  function drawGem(ctx, gem, cx, cy, cellSize) {
    const r = cellSize * GEM_RADIUS_RATIO;
    const color = GEM_COLORS[gem];
    const path = pathFor(gem, cx, cy, r);

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = cellSize * GLOW_BLUR_RATIO;
    ctx.fill(path);
    ctx.fill(path);
    ctx.restore();
  }

  function drawBoard(ctx, board, cellSize) {
    const size = board.length;
    ctx.clearRect(0, 0, size * cellSize, size * cellSize);

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        drawGem(ctx, board[row][col], cx, cy, cellSize);
      }
    }
  }

  const HIGHLIGHT_RING_INSET = 3;
  const HIGHLIGHT_COLORS = Object.freeze({
    cursor: '#ffffff',
    selection: '#00e5a8',
    target: '#ff7a00',
  });

  function drawHighlightRing(ctx, row, col, cellSize, color) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
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

  global.MagicGems.drawGem = drawGem;
  global.MagicGems.drawBoard = drawBoard;
  global.MagicGems.drawInteraction = drawInteraction;
  global.MagicGems.HIGHLIGHT_COLORS = HIGHLIGHT_COLORS;
  global.MagicGems.HIGHLIGHT_RING_INSET = HIGHLIGHT_RING_INSET;
})(typeof window !== 'undefined' ? window : globalThis);
