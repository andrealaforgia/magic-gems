(function (global) {
  'use strict';

  const CASCADE_TONE_COUNT = 4;

  // Deeper chains keep escalating in points (SPEC 10.6) but the bundled ascending
  // tone set only has 4 steps (11.2.6) - clamp at the top tone past that depth.
  function cascadeToneIndex(chainPosition) {
    return Math.min(chainPosition, CASCADE_TONE_COUNT);
  }

  // Decides which bundled cues (SPEC 11.2) a real keydown result calls for, without
  // touching the DOM/Audio itself - kept pure so every combination is cheaply
  // unit-testable, including the revive case (11.2.8), which is too rare to
  // reliably provoke through live play. Still keyed off reshuffle.ogg/'reshuffle'
  // (the sound identity predates REVIVE, which replaced the whole-board reshuffle
  // it was named for with a single-gem change) - reused rather than re-asseted,
  // since the underlying event it announces ("the board needed a fix") is the same.
  function soundsForKeydown(key, prevInteraction, next) {
    if (next.swapAnimation) {
      const sounds = [next.swapAnimation.matched ? 'swap' : 'invalid'];
      if (next.revived) sounds.push('reshuffle');
      return sounds;
    }
    if (key === ' ') {
      return next.interaction.selection && !prevInteraction.selection ? ['select'] : [];
    }
    if (key === 'Escape') return [];
    return ['cursor-move'];
  }

  function soundsForCascadeStep(step) {
    const sounds = ['shatter', `cascade-${cascadeToneIndex(step.chainPosition)}`];
    if (step.fallEvents.length > 0 || step.refillEvents.length > 0) sounds.push('drop');
    sounds.push('score');
    return sounds;
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.CASCADE_TONE_COUNT = CASCADE_TONE_COUNT;
  global.MagicGems.cascadeToneIndex = cascadeToneIndex;
  global.MagicGems.soundsForKeydown = soundsForKeydown;
  global.MagicGems.soundsForCascadeStep = soundsForCascadeStep;
})(typeof window !== 'undefined' ? window : globalThis);
