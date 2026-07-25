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

  // MP3/MP3-FIX: the split-screen match. Deliberately its own small,
  // standalone loop rather than a shared refactor of startSinglePlayer's own
  // closure above - reusing that much larger, already heavily-tested closure
  // wasn't worth the regression risk. Now carries its own audio/autoplay/
  // exit-confirm/multiplier-bar, each scoped to THIS client's own closure -
  // naturally independent per player, since each is a separate page/process
  // (MP3-FIX E2/E3/E4/E5; MP3 itself deferred all of these, which turned out
  // to be needed after all once real two-client play was tried live).
  async function startMatch(session, localName, onExit) {
    const {
      generateBoard,
      drawBoard,
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
      activateSeededRandom,
    } = global.MagicGems;

    const matchEl = document.getElementById('match');
    const localCanvas = document.getElementById('match-local-board');
    const remoteCanvas = document.getElementById('match-remote-board');
    const localNameEl = document.getElementById('match-local-name');
    const remoteNameEl = document.getElementById('match-remote-name');
    const localScoreEl = document.getElementById('match-local-score');
    const multiplierFillEl = document.getElementById('match-multiplier-fill');
    const multiplierMessageEl = document.getElementById('match-multiplier-message');
    const timerEl = document.getElementById('match-timer');
    const gaugeFillEl = document.getElementById('match-gauge-fill');
    const autoplayIndicatorEl = document.getElementById('match-autoplay-indicator');
    const audioToastEl = document.getElementById('match-audio-toast');
    const exitConfirmEl = document.getElementById('match-exit-confirm');

    // MP3-FIX E1: a still-focused form element from the lobby (e.g. the code
    // entry field, only ever focused on the joiner's own path - the host
    // never focuses one) surviving into the match could otherwise intercept
    // the very keys that drive the game, on any browser that doesn't auto-
    // blur an element whose ancestor just became hidden. Unconditional, not
    // just for the joiner, so the host's own path can never regress the same
    // way if it ever also focuses something first.
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    const localIndex = session.players[0] === localName ? 0 : 1;
    const remoteIndex = 1 - localIndex;
    localNameEl.textContent = session.players[localIndex];
    remoteNameEl.textContent = session.players[remoteIndex];

    const cellSize = computeCellSize(window.innerWidth * 0.4, window.innerHeight, BOARD_SIZE);
    localCanvas.width = remoteCanvas.width = BOARD_SIZE * cellSize;
    localCanvas.height = remoteCanvas.height = BOARD_SIZE * cellSize;
    const localCtx = localCanvas.getContext('2d');
    const remoteCtx = remoteCanvas.getContext('2d');
    const sprites = await loadGemSprites();
    const sound = createSoundPlayer();

    // SPEC 13.3.1: both clients derive the identical starting board from the
    // shared session code - left active (not restored) for the rest of this
    // match's own refills too, so luck stays equal there as well. Security
    // review (commit 30e7755): the restore handle is captured now so this
    // match's own exit (MP3-FIX E5) can hand real randomness back - session
    // codes are generated server-side (a separate process), never
    // client-side, so this seeded Math.random couldn't influence one anyway.
    const restoreRealRandom = activateSeededRandom(session.code);
    const startingBoard = ensurePlayable(generateBoard()).board;

    let board = startingBoard;
    let interaction = createInteractionState();
    let exitConfirmOpen = false;
    let fragments = [];
    let animationQueue = [];
    let activeAnimation = null;
    let score = 0;
    let lastCompletionTimeMs = performance.now();

    // SPEC 13.3.3: a sensible 50/50 state even at 0-0, not a divide-by-zero -
    // the remote score stays 0 this iteration (13.3.4's own scope boundary).
    function updateGauge() {
      const remoteScore = 0;
      const total = score + remoteScore;
      const fraction = total === 0 ? 0.5 : score / total;
      gaugeFillEl.style.width = `${fraction * 100}%`;
    }
    updateGauge();

    // MP3-FIX E2: a visible, independent multiplier per player - same
    // mechanic and display as single-player's own (SPEC 10.7-10.9), just on
    // this client's own local side.
    function updateMultiplierBar(timeMultiplier) {
      const fraction = multiplierFraction(timeMultiplier, TIME_MULTIPLIER_START);
      multiplierFillEl.style.width = `${fraction * 100}%`;
      multiplierFillEl.style.backgroundColor = multiplierBarColor(fraction);
      multiplierFillEl.dataset.multiplier = timeMultiplier;
      multiplierMessageEl.textContent = multiplierMessage(timeMultiplier);
    }

    function applyCompletionScore(runLengths, chainPosition) {
      const now = performance.now();
      const timeMultiplier = computeTimeMultiplier(now - lastCompletionTimeMs);
      const base = summedBasePoints(runLengths);
      const combo = comboFactorForChainIndex(chainPosition);
      score += computeCompletionScore(base, timeMultiplier, combo);
      lastCompletionTimeMs = now;
      localScoreEl.textContent = `Score: ${score}`;
      updateGauge();
    }

    function cellCenter(row, col) {
      return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
    }

    function spawnFragments(clearEvents) {
      for (const { row, col, gemType } of clearEvents) {
        const { x, y } = cellCenter(row, col);
        const sprite = sprites[gemType][0];
        const tagged = createFragments(x, y).map((f, i) => ({
          ...f,
          sprite,
          ...computeSourceTile(i, sprite.naturalWidth, sprite.naturalHeight),
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
        if (!matched) queue.push(buildSwapPhase(applySwap(preSwapBoard, a, b), a, b));
      }
      result.steps.forEach((step, i) => queue.push(buildCascadePhase(step, i + 1)));
      if (result.revived) queue.push(buildRevivePhase(result.board, result.changedCells));
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
      drawBoard(localCtx, anim.board, cellSize, sprites, hidden);
      const posA = cellCenter(anim.a.row, anim.a.col);
      const posB = cellCenter(anim.b.row, anim.b.col);
      const spriteA = interpolatePoint(posA.x, posA.y, posB.x, posB.y, progress);
      const spriteB = interpolatePoint(posB.x, posB.y, posA.x, posA.y, progress);
      global.MagicGems.drawGem(localCtx, anim.gemAtA, spriteA.x, spriteA.y, cellSize, sprites);
      global.MagicGems.drawGem(localCtx, anim.gemAtB, spriteB.x, spriteB.y, cellSize, sprites);
    }

    function renderCascadePhase(anim, progress) {
      const hidden = new Set();
      for (const e of anim.clearEvents) hidden.add(`${e.row},${e.col}`);
      for (const e of anim.fallEvents) {
        hidden.add(`${e.fromRow},${e.col}`);
        hidden.add(`${e.toRow},${e.col}`);
      }
      for (const e of anim.refillEvents) hidden.add(`${e.row},${e.col}`);

      drawBoard(localCtx, anim.boardBeforeStep, cellSize, sprites, hidden);

      for (const e of anim.fallEvents) {
        const from = cellCenter(e.fromRow, e.col);
        const to = cellCenter(e.toRow, e.col);
        const pos = interpolatePoint(from.x, from.y, to.x, to.y, progress);
        global.MagicGems.drawGem(localCtx, e.gemType, pos.x, pos.y, cellSize, sprites);
      }
      for (const e of anim.refillEvents) {
        const fromX = e.col * cellSize + cellSize / 2;
        const fromY = e.startRow * cellSize + cellSize / 2;
        const to = cellCenter(e.row, e.col);
        const pos = interpolatePoint(fromX, fromY, to.x, to.y, progress);
        global.MagicGems.drawGem(localCtx, e.gemType, pos.x, pos.y, cellSize, sprites);
      }
    }

    function renderRevivePhase(anim, progress) {
      const hidden = new Set(anim.changedCells.map((c) => `${c.row},${c.col}`));
      drawBoard(localCtx, anim.board, cellSize, sprites, hidden);
      const frameIndex = reviveSpinFrameIndex(progress);
      for (const { row, col } of anim.changedCells) {
        const { x, y } = cellCenter(row, col);
        global.MagicGems.drawGem(localCtx, anim.board[row][col], x, y, cellSize, sprites, frameIndex);
      }
    }

    function renderLocal() {
      if (activeAnimation) {
        const progress = clampProgress(activeAnimation.elapsedMs, activeAnimation.duration);
        if (activeAnimation.kind === 'swap') renderSwapPhase(activeAnimation, progress);
        else if (activeAnimation.kind === 'revive') renderRevivePhase(activeAnimation, progress);
        else renderCascadePhase(activeAnimation, progress);
      } else {
        drawBoard(localCtx, board, cellSize, sprites);
      }
      drawInteraction(localCtx, interaction, cellSize);
      drawFragments(localCtx, fragments);
    }

    // SPEC 13.3.4: no live opponent updates yet this iteration - the remote
    // side always shows the one shared starting board, never re-rendered.
    function renderRemote() {
      drawBoard(remoteCtx, startingBoard, cellSize, sprites);
    }

    renderLocal();
    renderRemote();
    // Matches renderLocal()'s own synchronous initial paint - otherwise the
    // multiplier bar/label would show nothing until the first frame.
    updateMultiplierBar(computeTimeMultiplier(0));

    function updateExitConfirmOverlay() {
      exitConfirmEl.hidden = !exitConfirmOpen;
    }

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

    // MP3-FIX E5: tears down this match session's own timers/frame/listener
    // (same convention as single-player's own teardown) and hands real
    // randomness back before returning to the start screen.
    function teardown() {
      cancelAnimationFrame(rafId);
      clearTimeout(autoplayTimer);
      clearTimeout(audioToastTimeout);
      document.removeEventListener('keydown', onKeydown);
      autoplayIndicatorEl.classList.remove('active');
      audioToastEl.classList.remove('visible');
      exitConfirmEl.hidden = true;
      restoreRealRandom();
    }

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
      animationQueue = animationQueue.concat(buildQueue(next));
      advanceQueue();
      renderLocal();
    }

    let autoplayEnabled = false;
    let autoplayQueue = [];
    let autoplayTimer = null;
    const autoplayKeyLog = [];

    function isBoardBusy() {
      return activeAnimation !== null || animationQueue.length > 0;
    }

    function runAutoplayStep() {
      if (!autoplayEnabled) return;
      if (autoplayQueue.length === 0) {
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

    const MATCH_DURATION_MS = 10 * 60 * 1000;
    const matchStartMs = performance.now();

    function formatTimer(remainingMs) {
      const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    let lastFrameTimeMs = null;
    function tick(frameTimeMs) {
      const isActive = fragments.length > 0 || activeAnimation !== null || animationQueue.length > 0;
      if (isActive) {
        if (lastFrameTimeMs !== null) {
          const dtMs = frameTimeMs - lastFrameTimeMs;
          if (fragments.length > 0) {
            fragments = pruneOffscreen(updateFragments(fragments, dtMs / 1000), localCanvas.height);
          }
          if (activeAnimation) {
            activeAnimation.elapsedMs += dtMs;
            if (activeAnimation.elapsedMs >= activeAnimation.duration) activeAnimation = null;
          }
          advanceQueue();
          renderLocal();
        }
        lastFrameTimeMs = frameTimeMs;
      } else {
        lastFrameTimeMs = null;
      }
      timerEl.textContent = formatTimer(MATCH_DURATION_MS - (performance.now() - matchStartMs));
      updateMultiplierBar(computeTimeMultiplier(performance.now() - lastCompletionTimeMs));
      rafId = requestAnimationFrame(tick);
    }
    let rafId = requestAnimationFrame(tick);

    // MP3-FIX E3/E4/E5: while the exit overlay is open, only Y/N are acted
    // on - even the S/A toggles are suspended, so this check comes first,
    // matching single-player's own established convention.
    function onKeydown(event) {
      if (matchEl.hidden) return;
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
      if (autoplayEnabled) return;
      dispatchGameKey(event.key);
    }
    document.addEventListener('keydown', onKeydown);

    // Test-observability seam, same convention as single-player's own.
    global.MagicGems.getMatchInteractionState = () => interaction;
    global.MagicGems.getMatchBoard = () => board;
    global.MagicGems.getMatchRemoteBoard = () => startingBoard;
    global.MagicGems.getMatchScore = () => score;
    global.MagicGems.getMatchSoundLog = () => sound.getLog();
    global.MagicGems.isMatchAudioMuted = () => sound.isMuted();
    global.MagicGems.isMatchAutoplayOn = () => autoplayEnabled;
    global.MagicGems.getMatchAutoplayKeyLog = () => autoplayKeyLog.slice();
  }

  // MP2/MP2-STORE: the multiplayer lobby - name entry, then Generate/Enter
  // code (the Generate/Enter choice itself follows the same 13.1.3 convention
  // as the start screen: arrow keys move the highlighted option, SPACE/ENTER
  // confirms), then either a waiting screen or a code-entry screen, ending at
  // a shared "ready" screen once both players are present. Wired to the real
  // REST-backed session service (api/magic-gems/session.mjs), which MP2's own
  // temporary localStorage stub previously stood in for.
  function initMultiplayerLobby(onExitToStartScreen) {
    const { createRestSessionClient } = global.MagicGems;
    const lobbyEl = document.getElementById('mp-lobby');
    const lobbyErrorEl = document.getElementById('mp-lobby-error');
    const nameStepEl = document.getElementById('mp-name-step');
    const nameInputEl = document.getElementById('mp-name-input');
    const choiceStepEl = document.getElementById('mp-choice-step');
    const generateBtn = document.getElementById('mp-generate-btn');
    const enterBtn = document.getElementById('mp-enter-btn');
    const generateStepEl = document.getElementById('mp-generate-step');
    const generatedCodeEl = document.getElementById('mp-generated-code');
    const enterStepEl = document.getElementById('mp-enter-step');
    const codeInputEl = document.getElementById('mp-code-input');
    const enterErrorEl = document.getElementById('mp-enter-error');
    const readyStepEl = document.getElementById('mp-ready-step');
    const readyNamesEl = document.getElementById('mp-ready-names');

    const sessionClient = createRestSessionClient();
    const choiceOptions = [generateBtn, enterBtn];
    const steps = { name: nameStepEl, choice: choiceStepEl, generate: generateStepEl, enter: enterStepEl, ready: readyStepEl };
    let step = 'name';
    let choiceIndex = 0;
    let playerName = '';
    let unsubscribe = null;

    function showStep(next) {
      step = next;
      Object.entries(steps).forEach(([key, el]) => {
        el.hidden = key !== step;
      });
    }

    function updateChoiceHighlight() {
      choiceOptions.forEach((btn, i) => btn.classList.toggle('selected', i === choiceIndex));
    }

    // SPEC 13.2.4: once a second player is present, both screens - the host's
    // (via the subscription below) and the joiner's own (right after it
    // joins) - land on the same shared "ready" state showing both names, then
    // (SPEC 13.2.4/13.3) both proceed into the match shortly after - a brief,
    // visible confirmation rather than an instant cut two independent clients
    // could otherwise show for inconsistent durations.
    const READY_TO_MATCH_DELAY_MS = 1200;

    function showReady(session) {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      readyNamesEl.textContent = session.players.join(' & ');
      showStep('ready');
      setTimeout(() => {
        lobbyEl.hidden = true;
        document.getElementById('match').hidden = false;
        startMatch(session, playerName, onExitToStartScreen);
      }, READY_TO_MATCH_DELAY_MS);
    }

    function chooseGenerate() {
      lobbyErrorEl.textContent = '';
      sessionClient
        .createSession(playerName)
        .then((session) => {
          generatedCodeEl.textContent = session.code;
          showStep('generate');
          unsubscribe = sessionClient.subscribeSession(session.code, (updated) => {
            if (updated && updated.players.length === 2) showReady(updated);
          });
        })
        // E4: a misconfigured/unavailable store must surface a clear error,
        // never leave the player staring at an unresponsive choice screen.
        .catch((err) => {
          lobbyErrorEl.textContent = 'Could not create a session - please try again.';
        });
    }

    function chooseEnter() {
      enterErrorEl.textContent = '';
      codeInputEl.value = '';
      showStep('enter');
      codeInputEl.focus();
    }

    function submitEnterCode() {
      const code = codeInputEl.value.trim().toUpperCase();
      if (!code) return;
      enterErrorEl.textContent = '';
      lobbyErrorEl.textContent = '';
      sessionClient
        .joinSession(code, playerName)
        .then((result) => {
          if (result.ok) {
            showReady(result.session);
          } else {
            enterErrorEl.textContent = result.error === 'not-found' ? 'Code not found' : 'Session is full';
          }
        })
        // E4: a misconfigured/unavailable store must surface a clear error,
        // never leave the player staring at an unresponsive code entry step.
        .catch((err) => {
          lobbyErrorEl.textContent = 'Could not reach the session service - please try again.';
        });
    }

    function submitName() {
      const trimmed = nameInputEl.value.trim();
      if (!trimmed) return;
      playerName = trimmed;
      choiceIndex = 0;
      updateChoiceHighlight();
      showStep('choice');
    }

    document.addEventListener('keydown', (event) => {
      if (lobbyEl.hidden) return;
      if (step === 'name') {
        if (event.key === 'Enter') submitName();
        return;
      }
      if (step === 'choice') {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          choiceIndex = choiceIndex === 0 ? 1 : 0;
          updateChoiceHighlight();
        } else if (event.key === ' ' || event.key === 'Enter') {
          if (choiceIndex === 0) chooseGenerate();
          else chooseEnter();
        }
        return;
      }
      if (step === 'enter') {
        if (event.key === 'Enter') submitEnterCode();
      }
    });

    generateBtn.addEventListener('click', chooseGenerate);
    enterBtn.addEventListener('click', chooseEnter);

    function startLobby() {
      lobbyEl.hidden = false;
      lobbyErrorEl.textContent = '';
      playerName = '';
      nameInputEl.value = '';
      showStep('name');
      nameInputEl.focus();
    }

    return { startLobby };
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
    const multiplayerLobby = initMultiplayerLobby(returnToStartScreen);
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
        // SPEC 13.1.2/13.2: the real lobby (MP2) - single-player must stay
        // fully reachable regardless (this path never touches its boot path).
        multiplayerLobby.startLobby();
      }
    }

    // SPEC 14.2: single-player's own exit (Y at the confirmation) ends the
    // game and lands back on a start screen that is fully re-operable, not a
    // dead end - re-arms the same `confirmed` guard confirmMode() checks.
    function returnToStartScreen() {
      gameEl.hidden = true;
      document.getElementById('match').hidden = true;
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
