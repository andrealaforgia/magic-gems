export default {
  mutate: ['src/board.js'],
  testRunner: 'command',
  commandRunner: { command: 'npm run test:unit' },
  reporters: ['clear-text', 'progress'],
  coverageAnalysis: 'off',
};

// 11 survivors on src/board.js's wouldMatchAt/hasMatch/UMD-wrapper are provably
// equivalent mutants: JS's permissive out-of-bounds-returns-undefined semantics makes
// the dropped bounds guards redundant, the weakened match checks only ever make
// candidate-rejection *more* conservative (never let a real match slip through, and
// never forbid more than a small constant subset of the 6 gem types so the retry loop
// still terminates), and globalThis === window in both real browsers and this
// project's own runtime usage. None are observable via any behavioural test.
