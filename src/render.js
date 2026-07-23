(function (global) {
  'use strict';

  const { GEM_COLORS } = global.MagicGems;

  const GLOW_BLUR_RATIO = 0.15;
  const GEM_RADIUS_RATIO = 0.3;

  function pathFor(gem, cx, cy, r) {
    const path = new Path2D();
    switch (gem) {
      case 'purple-triangle':
        path.moveTo(cx, cy - r);
        path.lineTo(cx + r * 0.87, cy + r * 0.6);
        path.lineTo(cx - r * 0.87, cy + r * 0.6);
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
        path.moveTo(cx, cy - r * 1.15);
        path.lineTo(cx + r * 0.75, cy);
        path.lineTo(cx, cy + r * 0.6);
        path.lineTo(cx - r * 0.75, cy);
        path.closePath();
        break;
      case 'blue-diamond':
        path.moveTo(cx, cy - r * 0.6);
        path.lineTo(cx + r * 0.75, cy);
        path.lineTo(cx, cy + r * 1.15);
        path.lineTo(cx - r * 0.75, cy);
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

  global.MagicGems.drawGem = drawGem;
  global.MagicGems.drawBoard = drawBoard;
})(typeof window !== 'undefined' ? window : globalThis);
