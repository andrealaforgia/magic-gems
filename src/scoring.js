(function (global) {
  'use strict';

  const BASE_POINTS_PER_EXTRA_LENGTH = 50;
  const TIME_MULTIPLIER_START = 300;
  const SCORE_DIVISOR = 100;

  function runBasePoints(runLength) {
    return (runLength - 2) * BASE_POINTS_PER_EXTRA_LENGTH;
  }

  function summedBasePoints(runLengths) {
    return runLengths.reduce((sum, length) => sum + runBasePoints(length), 0);
  }

  function computeTimeMultiplier(elapsedMs) {
    const wholeSecondsElapsed = Math.floor(Math.max(0, elapsedMs) / 1000);
    return Math.max(0, TIME_MULTIPLIER_START - wholeSecondsElapsed);
  }

  function comboFactorForChainIndex(chainIndex) {
    return 2 ** (chainIndex - 1);
  }

  function computeCompletionScore(summedBase, timeMultiplier, comboFactor) {
    return Math.floor((summedBase * timeMultiplier * comboFactor) / SCORE_DIVISOR);
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.runBasePoints = runBasePoints;
  global.MagicGems.summedBasePoints = summedBasePoints;
  global.MagicGems.TIME_MULTIPLIER_START = TIME_MULTIPLIER_START;
  global.MagicGems.computeTimeMultiplier = computeTimeMultiplier;
  global.MagicGems.comboFactorForChainIndex = comboFactorForChainIndex;
  global.MagicGems.computeCompletionScore = computeCompletionScore;
})(typeof window !== 'undefined' ? window : globalThis);
