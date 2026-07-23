export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorDistance([r1, g1, b1], [r2, g2, b2]) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Euclidean RGB distance under which a sampled pixel is confidently one of N
// candidate palette colours rather than background/glow-blend noise. The six gem
// colours and three highlight colours are all >100 apart from each other and from
// the near-black background (~rgb(10,10,18)), so 40 leaves comfortable headroom
// without being loose enough to misclassify across colours.
export const CLASSIFY_TOLERANCE = 40;

// Tighter bound for checking a pixel against one already-known expected colour
// (not classifying among several candidates) — used where the isolated single-gem
// probe samples its own centre pixel and compares it to that exact gem's palette entry.
export const OWN_COLOR_MATCH_TOLERANCE = 20;

// Background is a near-black navy (~rgb(10,10,18), luma ~13). Gem cores and their
// glow are always much brighter. 30 sits comfortably above background luma and well
// below any gem's glow-tail brightness, so it reliably separates "empty cell" from
// "cell holds something".
export const BACKGROUND_LUMA_CEILING = 30;

// A sampled point is "solidly filled" (inside a shape's hard core, not just touched
// by its glow's blurred tail) once its alpha crosses this line. Calibrated empirically
// against all 6 gem shapes: true interior points read ~232-255, true exterior points
// (background or glow-tail) read ~5-150, leaving a clear gap around 200.
export const SHAPE_FILL_ALPHA_THRESHOLD = 200;

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

// Classifies the shape drawn around (cx, cy) with nominal radius r by sampling 3
// diagnostic points chosen from this project's own shape geometry (src/render.js):
// a mid-height horizontal point only the triangle's linear taper fails to reach; a
// corner point only the square's axis-aligned bounding box reaches; and a near-top
// point only the circle's round boundary excludes. Whatever remains once those three
// are ruled out is one of the two diamond variants (yellow/blue) — both count as
// "diamond" here, since shape identity, not colour, is all this distinguishes.
// Verified empirically against all 6 gem types (see commit history).
export function classifyShape(getAlphaAt, r, threshold = SHAPE_FILL_ALPHA_THRESHOLD) {
  const filled = (dx, dy) => getAlphaAt(dx, dy) > threshold;

  if (!filled(0.6 * r, 0)) return 'triangle';
  if (filled(0.75 * r, 0.75 * r)) return 'square';
  if (!filled(0, -0.97 * r)) return 'circle';
  return 'diamond';
}
