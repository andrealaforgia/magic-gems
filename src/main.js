(function (global) {
  'use strict';

  const BOARD_SIZE = 8;
  const SWAP_DURATION_MS = 400;
  const FALL_DURATION_MS = 400;
  const REVIVE_SPIN_DURATION_MS = 700;
  // SPEC 12.2 (re-frozen, AUTOPLAY-SPEED): autoplay runs at a brisk MODERATE
  // pace - clearly faster than manual play, easy to follow rather than a blur.
  // Explicitly a tuning choice adjusted by feel, not a fixed frozen figure - the
  // values below are the moderate pass (80/160/160/300) each stretched by ~1.33x
  // (a further "run it a notch slower" nudge, ~75% of that rate): 80->107,
  // 160->213 (twice), 300->400. Ordinary player-driven play keeps the
  // deliberate 9.3 pace above untouched.
  const AUTOPLAY_STEP_MS = 107;
  const AUTOPLAY_SWAP_DURATION_MS = 213;
  const AUTOPLAY_FALL_DURATION_MS = 213;
  const AUTOPLAY_REVIVE_SPIN_DURATION_MS = 400;

  // Test-observability only (QA review, commit 280629a): lives outside any one
  // session's own closure so it survives across an exit+restart, letting a test
  // prove teardown() genuinely ran before the next session starts - kept in the
  // exact same two places as the real addEventListener/removeEventListener
  // calls it's paired with, not a hand-waved separate bookkeeping value.
  let activeSinglePlayerSessions = 0;

  // SPEC 13.1.1: single-player is everything already delivered, started only
  // once the player actually chooses it from the start screen rather than on
  // page load directly.
  async function startSinglePlayer(onExit) {
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
      multiplierMessage,
      createSoundPlayer,
      soundsForKeydown,
      soundsForCascadeStep,
      reviveSpinFrameIndex,
      planAutoplaySteps,
    } = global.MagicGems;
    const canvas = document.getElementById('board');
    const scoreEl = document.getElementById('score');
    const multiplierFillEl = document.getElementById('multiplier-fill');
    const multiplierMessageEl = document.getElementById('multiplier-message');
    const audioToastEl = document.getElementById('audio-toast');
    const autoplayIndicatorEl = document.getElementById('autoplay-indicator');
    const exitConfirmEl = document.getElementById('exit-confirm');
    const cellSize = computeCellSize(window.innerWidth, window.innerHeight, BOARD_SIZE);
    canvas.width = BOARD_SIZE * cellSize;
    canvas.height = BOARD_SIZE * cellSize;

    const ctx = canvas.getContext('2d');
    const sprites = await loadGemSprites();
    let board = ensurePlayable(generateBoard()).board;
    let interaction = createInteractionState();
    let exitConfirmOpen = false;
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
      multiplierMessageEl.textContent = multiplierMessage(timeMultiplier);
    }

    function cellCenter(row, col) {
      return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
    }

    function spawnFragments(clearEvents) {
      for (const { row, col, gemType } of clearEvents) {
        const { x, y } = cellCenter(row, col);
        const sprite = sprites[gemType][0];
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
        duration: autoplayEnabled ? AUTOPLAY_SWAP_DURATION_MS : SWAP_DURATION_MS,
        board: fromBoard,
        a,
        b,
        gemAtA: fromBoard[a.row][a.col],
        gemAtB: fromBoard[b.row][b.col],
      };
    }

    function buildCascadePhase(step, chainPosition) {
      const duration = autoplayEnabled ? AUTOPLAY_FALL_DURATION_MS : FALL_DURATION_MS;
      return { kind: 'cascade', duration, chainPosition, ...step };
    }

    function buildRevivePhase(finalBoard, changedCells) {
      const duration = autoplayEnabled ? AUTOPLAY_REVIVE_SPIN_DURATION_MS : REVIVE_SPIN_DURATION_MS;
      return { kind: 'revive', duration, board: finalBoard, changedCells };
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
      // SPEC 8.3.1: the revive highlight plays last, after any cascade has fully
      // settled - result.board is already the final, post-revive board by this point.
      if (result.revived) {
        queue.push(buildRevivePhase(result.board, result.changedCells));
      }
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

    function renderRevivePhase(anim, progress) {
      const hidden = new Set(anim.changedCells.map((c) => `${c.row},${c.col}`));
      drawBoard(ctx, anim.board, cellSize, sprites, hidden);
      const frameIndex = reviveSpinFrameIndex(progress);
      for (const { row, col } of anim.changedCells) {
        const { x, y } = cellCenter(row, col);
        drawGem(ctx, anim.board[row][col], x, y, cellSize, sprites, frameIndex);
      }
    }

    function render() {
      if (activeAnimation) {
        const progress = clampProgress(activeAnimation.elapsedMs, activeAnimation.duration);
        if (activeAnimation.kind === 'swap') {
          renderSwapPhase(activeAnimation, progress);
        } else if (activeAnimation.kind === 'revive') {
          renderRevivePhase(activeAnimation, progress);
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
    // Matches render()'s own synchronous initial paint above - otherwise the
    // multiplier bar/label would show nothing at all until the first
    // requestAnimationFrame callback fires, however soon that normally is.
    updateMultiplierBar(computeTimeMultiplier(0));

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
      rafId = requestAnimationFrame(tick);
    }

    let rafId = requestAnimationFrame(tick);

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

    function updateExitConfirmOverlay() {
      exitConfirmEl.hidden = !exitConfirmOpen;
    }

    // SPEC 14.2: stops every timer/frame/listener this session owns, so a
    // subsequent single-player restart never leaves a second copy of any of
    // them running alongside the fresh one it creates.
    function teardown() {
      cancelAnimationFrame(rafId);
      clearTimeout(autoplayTimer);
      clearTimeout(audioToastTimeout);
      document.removeEventListener('keydown', onKeydown);
      activeSinglePlayerSessions--;
      autoplayIndicatorEl.classList.remove('active');
      audioToastEl.classList.remove('visible');
      exitConfirmEl.hidden = true;
    }

    // Shared by real keydown input and autoplay's own emulated key presses
    // (SPEC 12.2), so a self-played move resolves through exactly the same
    // scoring/sound/animation/revive pipeline as a real one - no special-casing.
    function dispatchGameKey(key) {
      const next = handleGameKey({ board, interaction, exitConfirmOpen }, key);
      const stateChanged = next.board !== board || next.interaction !== interaction || next.exitConfirmOpen !== exitConfirmOpen;
      if (!stateChanged) return;
      if (next.board !== board || next.interaction !== interaction) {
        soundsForKeydown(key, interaction, next).forEach((name) => sound.play(name));
      }
      board = next.board;
      interaction = next.interaction;
      exitConfirmOpen = next.exitConfirmOpen;
      updateExitConfirmOverlay();
      if (next.exitRequested) {
        teardown();
        onExit();
        return;
      }
      lastCommitSteps = next.steps;
      animationQueue = animationQueue.concat(buildQueue(next));
      advanceQueue();
      render();
    }

    let autoplayEnabled = false;
    let autoplayQueue = [];
    let autoplayTimer = null;
    // Test-observability only (SPEC 12.2's "watchable pace" claim needs a real
    // timestamp trail to verify against, not just that moves eventually happen).
    const autoplayKeyLog = [];

    function isBoardBusy() {
      return activeAnimation !== null || animationQueue.length > 0;
    }

    function runAutoplayStep() {
      if (!autoplayEnabled) return;
      if (autoplayQueue.length === 0) {
        // Wait for any swap/cascade/revive already in flight to fully settle
        // before planning the next move, so autoplay's own moves never
        // interleave mid-animation (SPEC 12.2's "watchable pace").
        if (isBoardBusy()) {
          autoplayTimer = setTimeout(runAutoplayStep, AUTOPLAY_STEP_MS);
          return;
        }
        autoplayQueue = planAutoplaySteps(board, interaction.cursor);
      }
      const key = autoplayQueue.shift();
      if (key !== undefined) {
        autoplayKeyLog.push({ key, ts: performance.now() });
        dispatchGameKey(key);
      }
      autoplayTimer = setTimeout(runAutoplayStep, AUTOPLAY_STEP_MS);
    }

    function toggleAutoplay() {
      autoplayEnabled = !autoplayEnabled;
      autoplayIndicatorEl.classList.toggle('active', autoplayEnabled);
      clearTimeout(autoplayTimer);
      if (autoplayEnabled) {
        autoplayQueue = [];
        autoplayTimer = setTimeout(runAutoplayStep, AUTOPLAY_STEP_MS);
      }
    }

    // SPEC 14.3: while the exit overlay is open, only Y/N are acted on - even
    // the S/A toggles are suspended, so this check comes before either of them.
    function onKeydown(event) {
      if (exitConfirmOpen) {
        dispatchGameKey(event.key);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 's') {
        toggleAudio();
        return;
      }
      if (key === 'a') {
        toggleAutoplay();
        return;
      }
      // SPEC 12.3: normal input is ignored outright while autoplay drives the game.
      if (autoplayEnabled) return;
      dispatchGameKey(event.key);
    }
    document.addEventListener('keydown', onKeydown);
    activeSinglePlayerSessions++;

    // Observability seam for tests: animation/shatter state is real, time-based
    // state that isn't otherwise reachable from outside this closure.
    global.MagicGems.getActiveFragments = () => fragments;
    global.MagicGems.isAnimating = () => activeAnimation !== null || animationQueue.length > 0;
    global.MagicGems.getAnimationPhase = () => (activeAnimation ? activeAnimation.kind : null);
    global.MagicGems.getLastCommitSteps = () => lastCommitSteps;
    global.MagicGems.getSpriteImages = () => sprites;
    global.MagicGems.getSoundLog = () => sound.getLog();
    global.MagicGems.isAudioMuted = () => sound.isMuted();
    global.MagicGems.isAutoplayOn = () => autoplayEnabled;
    global.MagicGems.getInteractionState = () => interaction;
    global.MagicGems.getAutoplayKeyLog = () => autoplayKeyLog.slice();
    global.MagicGems.AUTOPLAY_STEP_MS = AUTOPLAY_STEP_MS;
    global.MagicGems.getActiveSinglePlayerSessions = () => activeSinglePlayerSessions;
    // The only mutator in this seam: backdates lastCompletionTimeMs so a real
    // tick (the next requestAnimationFrame, not a re-derivation) drains the
    // multiplier for real, without a real multi-second wait or the fake-clock
    // instability already ruled out for this page (see scoring.steps.js).
    global.MagicGems.setElapsedSinceLastCompletionMs = (ms) => {
      lastCompletionTimeMs = performance.now() - ms;
    };
  }

  // SPEC 13.1: the start screen gates which mode actually boots - the 8x8
  // board/game itself isn't shown, and single-player's own boot doesn't run,
  // until the player picks one.
  // SPEC 13.1.3: fully keyboard-operable, the same standard every future
  // multiplayer menu follows - arrow keys move the highlighted selection,
  // SPACE or ENTER confirms it, equivalently to a direct click on either option.
  function initStartScreen() {
    const startScreenEl = document.getElementById('start-screen');
    const gameEl = document.getElementById('game');
    const mpPlaceholderEl = document.getElementById('mp-placeholder');
    const singleBtn = document.getElementById('start-single-btn');
    const multiplayerBtn = document.getElementById('start-multiplayer-btn');
    const options = [singleBtn, multiplayerBtn];
    let selectedIndex = 0;
    let confirmed = false;

    function updateHighlight() {
      options.forEach((btn, i) => btn.classList.toggle('selected', i === selectedIndex));
    }
    updateHighlight();

    // Guarded by `confirmed` (not `{ once: true }`) so a click and a keyboard
    // confirm can never both fire - whichever input method the player used.
    function confirmMode(mode) {
      if (confirmed) return;
      confirmed = true;
      startScreenEl.hidden = true;
      if (mode === 'single') {
        gameEl.hidden = false;
        startSinglePlayer(returnToStartScreen);
      } else {
        // SPEC 13.1.2: multiplayer's real lobby isn't built yet - a placeholder
        // screen stands in for it, and single-player must stay fully reachable
        // regardless (this path never touches the single-player boot path).
        mpPlaceholderEl.hidden = false;
      }
    }

    // SPEC 14.2: single-player's own exit (Y at the confirmation) ends the
    // game and lands back on a start screen that is fully re-operable, not a
    // dead end - re-arms the same `confirmed` guard confirmMode() checks.
    function returnToStartScreen() {
      gameEl.hidden = true;
      confirmed = false;
      selectedIndex = 0;
      updateHighlight();
      startScreenEl.hidden = false;
    }

    singleBtn.addEventListener('click', () => confirmMode('single'));
    multiplayerBtn.addEventListener('click', () => confirmMode('multiplayer'));

    document.addEventListener('keydown', (event) => {
      if (confirmed) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        selectedIndex = selectedIndex === 0 ? 1 : 0;
        updateHighlight();
      } else if (event.key === ' ' || event.key === 'Enter') {
        confirmMode(selectedIndex === 0 ? 'single' : 'multiplayer');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initStartScreen);
})(typeof window !== 'undefined' ? window : globalThis);
