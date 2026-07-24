(function (global) {
  'use strict';

  const BOARD_SIZE = 8;
  const SWAP_DURATION_MS = 400;
  const FALL_DURATION_MS = 400;

  async function boot() {
    const {
      generateBoard,
      drawBoard,
      drawGem,
      drawInteraction,
      drawFragments,
      createInteractionState,
      handleGameKey,
      computeCellSize,
      ensurePlayable,
      applySwap,
      createFragments,
      updateFragments,
      pruneOffscreen,
      computeSourceTile,
      clampProgress,
      interpolatePoint,
      loadGemSprites,
      summedBasePoints,
      computeTimeMultiplier,
      comboFactorForChainIndex,
      computeCompletionScore,
      TIME_MULTIPLIER_START,
      multiplierFraction,
      multiplierBarColor,
      createSoundPlayer,
      soundsForKeydown,
      soundsForCascadeStep,
    } = global.MagicGems;
    const canvas = document.getElementById('board');
    const scoreEl = document.getElementById('score');
    const multiplierFillEl = document.getElementById('multiplier-fill');
    const audioToastEl = document.getElementById('audio-toast');
    const cellSize = computeCellSize(window.innerWidth, window.innerHeight, BOARD_SIZE);
    canvas.width = BOARD_SIZE * cellSize;
    canvas.height = BOARD_SIZE * cellSize;

    const ctx = canvas.getContext('2d');
    const sprites = await loadGemSprites();
    let board = ensurePlayable(generateBoard());
    let interaction = createInteractionState();
    let fragments = [];
    let animationQueue = [];
    let activeAnimation = null;
    let lastCommitSteps = [];
    let score = 0;
    let lastCompletionTimeMs = performance.now();
    const sound = createSoundPlayer();

    function applyCompletionScore(runLengths, chainPosition) {
      const now = performance.now();
      const timeMultiplier = computeTimeMultiplier(now - lastCompletionTimeMs);
      const base = summedBasePoints(runLengths);
      const combo = comboFactorForChainIndex(chainPosition);
      score += computeCompletionScore(base, timeMultiplier, combo);
      lastCompletionTimeMs = now;
      scoreEl.textContent = `Score: ${score}`;
    }

    function updateMultiplierBar(timeMultiplier) {
      const fraction = multiplierFraction(timeMultiplier, TIME_MULTIPLIER_START);
      multiplierFillEl.style.width = `${fraction * 100}%`;
      multiplierFillEl.style.backgroundColor = multiplierBarColor(fraction);
      // The bar's fill/colour are the real display (SPEC 10.8); this attribute is
      // just a precise, unrounded readout of the same underlying value for tests -
      // recovering it from a CSS percentage would lose precision.
      multiplierFillEl.dataset.multiplier = timeMultiplier;
    }

    function cellCenter(row, col) {
      return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
    }

    function spawnFragments(clearEvents) {
      for (const { row, col, gemType } of clearEvents) {
        const { x, y } = cellCenter(row, col);
        const sprite = sprites[gemType];
        // originRow/originCol are additive test-observability metadata (unused by
        // rendering) so tests can verify which cell a fragment came from without
        // inferring it from a position that drifts over time.
        const tagged = createFragments(x, y).map((f, i) => ({
          ...f,
          sprite,
          ...computeSourceTile(i, sprite.naturalWidth, sprite.naturalHeight),
          originRow: row,
          originCol: col,
        }));
        fragments = fragments.concat(tagged);
      }
    }

    function buildSwapPhase(fromBoard, a, b) {
      return {
        kind: 'swap',
        duration: SWAP_DURATION_MS,
        board: fromBoard,
        a,
        b,
        gemAtA: fromBoard[a.row][a.col],
        gemAtB: fromBoard[b.row][b.col],
      };
    }

    function buildCascadePhase(step, chainPosition) {
      return { kind: 'cascade', duration: FALL_DURATION_MS, chainPosition, ...step };
    }

    function buildQueue(result) {
      const queue = [];
      if (result.swapAnimation) {
        const { a, b, preSwapBoard, matched } = result.swapAnimation;
        queue.push(buildSwapPhase(preSwapBoard, a, b));
        if (!matched) {
          queue.push(buildSwapPhase(applySwap(preSwapBoard, a, b), a, b));
        }
      }
      // Each step's chain position (SPEC 10.6) is fixed here, from its own index
      // within *this* commit's own steps - never a shared counter read later, which
      // a second swap committed before this chain finishes draining could reset
      // out from under these still-queued steps.
      result.steps.forEach((step, i) => {
        queue.push(buildCascadePhase(step, i + 1));
      });
      return queue;
    }

    function advanceQueue() {
      if (activeAnimation !== null || animationQueue.length === 0) return;
      activeAnimation = animationQueue.shift();
      activeAnimation.elapsedMs = 0;
      if (activeAnimation.kind === 'cascade') {
        spawnFragments(activeAnimation.clearEvents);
        applyCompletionScore(activeAnimation.runLengths, activeAnimation.chainPosition);
        soundsForCascadeStep(activeAnimation).forEach((name) => sound.play(name));
      }
    }

    function renderSwapPhase(anim, progress) {
      const hidden = new Set([`${anim.a.row},${anim.a.col}`, `${anim.b.row},${anim.b.col}`]);
      drawBoard(ctx, anim.board, cellSize, sprites, hidden);
      const posA = cellCenter(anim.a.row, anim.a.col);
      const posB = cellCenter(anim.b.row, anim.b.col);
      const spriteA = interpolatePoint(posA.x, posA.y, posB.x, posB.y, progress);
      const spriteB = interpolatePoint(posB.x, posB.y, posA.x, posA.y, progress);
      drawGem(ctx, anim.gemAtA, spriteA.x, spriteA.y, cellSize, sprites);
      drawGem(ctx, anim.gemAtB, spriteB.x, spriteB.y, cellSize, sprites);
    }

    function renderCascadePhase(anim, progress) {
      const hidden = new Set();
      for (const e of anim.clearEvents) hidden.add(`${e.row},${e.col}`);
      for (const e of anim.fallEvents) {
        hidden.add(`${e.fromRow},${e.col}`);
        hidden.add(`${e.toRow},${e.col}`);
      }
      for (const e of anim.refillEvents) hidden.add(`${e.row},${e.col}`);

      drawBoard(ctx, anim.boardBeforeStep, cellSize, sprites, hidden);

      for (const e of anim.fallEvents) {
        const from = cellCenter(e.fromRow, e.col);
        const to = cellCenter(e.toRow, e.col);
        const pos = interpolatePoint(from.x, from.y, to.x, to.y, progress);
        drawGem(ctx, e.gemType, pos.x, pos.y, cellSize, sprites);
      }
      for (const e of anim.refillEvents) {
        const fromX = e.col * cellSize + cellSize / 2;
        const fromY = e.startRow * cellSize + cellSize / 2;
        const to = cellCenter(e.row, e.col);
        const pos = interpolatePoint(fromX, fromY, to.x, to.y, progress);
        drawGem(ctx, e.gemType, pos.x, pos.y, cellSize, sprites);
      }
    }

    function render() {
      if (activeAnimation) {
        const progress = clampProgress(activeAnimation.elapsedMs, activeAnimation.duration);
        if (activeAnimation.kind === 'swap') {
          renderSwapPhase(activeAnimation, progress);
        } else {
          renderCascadePhase(activeAnimation, progress);
        }
      } else {
        drawBoard(ctx, board, cellSize, sprites);
      }
      drawInteraction(ctx, interaction, cellSize);
      drawFragments(ctx, fragments);
    }

    render();

    let lastFrameTimeMs = null;

    function tick(frameTimeMs) {
      const isActive = fragments.length > 0 || activeAnimation !== null || animationQueue.length > 0;
      if (isActive) {
        if (lastFrameTimeMs !== null) {
          const dtMs = frameTimeMs - lastFrameTimeMs;
          if (fragments.length > 0) {
            fragments = pruneOffscreen(updateFragments(fragments, dtMs / 1000), canvas.height);
          }
          if (activeAnimation) {
            activeAnimation.elapsedMs += dtMs;
            if (activeAnimation.elapsedMs >= activeAnimation.duration) {
              activeAnimation = null;
            }
          }
          advanceQueue();
          render();
        }
        lastFrameTimeMs = frameTimeMs;
      } else {
        lastFrameTimeMs = null;
      }
      // After the above, so a completion's reset (SPEC 10.5) this same frame is
      // reflected immediately - never a stale pre-reset value even for one tick.
      // Independent of the isActive gate above: the multiplier keeps ticking down
      // in real time even while the board sits at rest with nothing else to
      // animate (SPEC 10.8). Uses performance.now() rather than the rAF frameTimeMs
      // parameter, matching the clock applyCompletionScore stamps lastCompletionTimeMs
      // with - mixing the two would read a small negative elapsed on the exact tick
      // a reset happens (frameTimeMs is captured before this tick's own work runs).
      updateMultiplierBar(computeTimeMultiplier(performance.now() - lastCompletionTimeMs));
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    // SPEC 11.5.1: shown instantly (via the 'visible' class, which has its own
    // zero-duration transition) then faded via the base rule's transition once
    // 'visible' is removed - a later toggle mid-fade restarts the same cycle
    // cleanly rather than stacking timers.
    const AUDIO_TOAST_VISIBLE_MS = 800;
    let audioToastTimeout = null;

    function showAudioToast(text) {
      clearTimeout(audioToastTimeout);
      audioToastEl.textContent = text;
      audioToastEl.classList.add('visible');
      audioToastTimeout = setTimeout(() => audioToastEl.classList.remove('visible'), AUDIO_TOAST_VISIBLE_MS);
    }

    function toggleAudio() {
      const nowMuted = !sound.isMuted();
      sound.setMuted(nowMuted);
      showAudioToast(nowMuted ? 'SOUND OFF' : 'SOUND ON');
    }

    document.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 's') {
        toggleAudio();
        return;
      }
      const next = handleGameKey({ board, interaction }, event.key);
      if (next.board !== board || next.interaction !== interaction) {
        soundsForKeydown(event.key, interaction, next).forEach((name) => sound.play(name));
        board = next.board;
        interaction = next.interaction;
        lastCommitSteps = next.steps;
        animationQueue = animationQueue.concat(buildQueue(next));
        advanceQueue();
        render();
      }
    });

    // Observability seam for tests: animation/shatter state is real, time-based
    // state that isn't otherwise reachable from outside this closure.
    global.MagicGems.getActiveFragments = () => fragments;
    global.MagicGems.isAnimating = () => activeAnimation !== null || animationQueue.length > 0;
    global.MagicGems.getAnimationPhase = () => (activeAnimation ? activeAnimation.kind : null);
    global.MagicGems.getLastCommitSteps = () => lastCommitSteps;
    global.MagicGems.getSpriteImages = () => sprites;
    global.MagicGems.getSoundLog = () => sound.getLog();
    global.MagicGems.isAudioMuted = () => sound.isMuted();
  }

  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);
