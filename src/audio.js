(function (global) {
  'use strict';

  const SOUND_FILES = {
    'cursor-move': 'assets/audio/cursor-move.ogg',
    select: 'assets/audio/select.ogg',
    swap: 'assets/audio/swap.ogg',
    invalid: 'assets/audio/invalid.ogg',
    shatter: 'assets/audio/shatter.ogg',
    drop: 'assets/audio/drop.ogg',
    reshuffle: 'assets/audio/reshuffle.ogg',
    score: 'assets/audio/score.ogg',
    'cascade-1': 'assets/audio/cascade-1.ogg',
    'cascade-2': 'assets/audio/cascade-2.ogg',
    'cascade-3': 'assets/audio/cascade-3.ogg',
    'cascade-4': 'assets/audio/cascade-4.ogg',
  };

  function createSoundPlayer() {
    const cache = {};
    const log = [];
    let muted = false;

    function elementFor(name) {
      if (cache[name]) return cache[name];
      const src = SOUND_FILES[name];
      if (!src) return null;
      try {
        cache[name] = new Audio(src);
        return cache[name];
      } catch (err) {
        return null;
      }
    }

    // SPEC 11.3: audio must never block or break play. A user's first keypress is
    // already the qualifying gesture browsers require before allowing playback, and
    // every sound here is triggered from a keydown handler or its direct
    // consequences, so no separate unlock step is needed - only defend against
    // playback failing (blocked, unsupported, file missing) by swallowing it.
    // SPEC 11.5: muting stops sounds at the source - nothing is even attempted
    // (and nothing new is logged), not just silenced after the fact.
    function play(name) {
      if (muted) return;
      log.push(name);
      const el = elementFor(name);
      if (!el) return;
      try {
        // Cloned so overlapping triggers of the same sound don't cut each other
        // off by restarting a single shared element mid-playback.
        const instance = el.cloneNode();
        const result = instance.play();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (err) {
        // Playback unavailable - gameplay continues regardless.
      }
    }

    function setMuted(value) {
      muted = value;
    }

    return { play, getLog: () => log.slice(), setMuted, isMuted: () => muted };
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.createSoundPlayer = createSoundPlayer;
  global.MagicGems.BUNDLED_SOUND_NAMES = Object.keys(SOUND_FILES);
})(typeof window !== 'undefined' ? window : globalThis);
