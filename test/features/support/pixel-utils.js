export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorDistance([r1, g1, b1], [r2, g2, b2]) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Euclidean RGB distance under which a sampled pixel is confidently one of N
// candidate palette colours rather than checkerboard background/antialiasing noise.
// The seven gem sprites' own sampled colours and the three highlight colours are
// all >100 apart from each other and from the two dark-grey checkerboard shades
// (SPEC 3.5), so 40 leaves comfortable headroom without being loose enough to
// misclassify across colours.
export const CLASSIFY_TOLERANCE = 40;

// How far off exact-center the canvas's on-screen bounding box may sit and still
// count as "the central part of the viewport" (SPEC 3.2) — 10% of the viewport
// dimension is a generous, visually-central margin without requiring pixel-perfect centering.
export const VIEWPORT_CENTER_TOLERANCE_RATIO = 0.1;

export function classifyColor(rgb, palette, tolerance = CLASSIFY_TOLERANCE) {
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
