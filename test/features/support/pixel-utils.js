export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorDistance([r1, g1, b1], [r2, g2, b2]) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function classifyColor(rgb, palette, tolerance = 40) {
  let best = null;
  let bestDist = Infinity;
  for (const [key, hex] of Object.entries(palette)) {
    const d = colorDistance(rgb, hexToRgb(hex));
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  return bestDist < tolerance ? best : null;
}
