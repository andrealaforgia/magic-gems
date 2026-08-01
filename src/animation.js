(function (global) {
  'use strict';

  global.MagicGems = global.MagicGems || {};
  const { applySwap } = global.MagicGems;

  const SWAP_DURATION_MS = 400;
  const FALL_DURATION_MS = 400;
  const REVIVE_SPIN_DURATION_MS = 700;

  function clampProgress(elapsedMs, durationMs) {
    if (durationMs <= 0) return 1;
    return Math.max(0, Math.min(1, elapsedMs / durationMs));
  }

  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }

  function interpolatePoint(fromX, fromY, toX, toY, progress) {
    return { x: lerp(fromX, toX, progress), y: lerp(fromY, toY, progress) };
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

  function buildRevivePhase(backgroundBoard, finalBoard, rotatingCells) {
    return { kind: 'revive', duration: REVIVE_SPIN_DURATION_MS, board: backgroundBoard, finalBoard, rotatingCells };
  }

  // SPEC 8.3.1 (AUTOPLAY-INVALID-MOVE fix, examiner-verified defect TWO): the
  // revive highlight now plays FIRST, right alongside the logical mutation
  // that already happened synchronously at commit - queuing it after the
  // swap/cascade phases (the previous order) left the rotation disconnected
  // in time from the change it's meant to mark, appearing only once however
  // many cascade steps the commit produced had already finished playing.
  function buildQueue(result) {
    const queue = [];
    if (result.revived) {
      const backgroundBoard = result.swapAnimation ? result.swapAnimation.preSwapBoard : result.board;
      queue.push(buildRevivePhase(backgroundBoard, result.board, result.rotatingCells));
    }
    if (result.swapAnimation) {
      const { a, b, preSwapBoard, matched } = result.swapAnimation;
      queue.push(buildSwapPhase(preSwapBoard, a, b));
      if (!matched) {
        queue.push(buildSwapPhase(applySwap(preSwapBoard, a, b), a, b));
      }
    }
    result.steps.forEach((step, i) => {
      queue.push(buildCascadePhase(step, i + 1));
    });
    return queue;
  }

  global.MagicGems.clampProgress = clampProgress;
  global.MagicGems.lerp = lerp;
  global.MagicGems.interpolatePoint = interpolatePoint;
  global.MagicGems.buildQueue = buildQueue;
})(typeof window !== 'undefined' ? window : globalThis);
