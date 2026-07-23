(function (global) {
  'use strict';

  const SIZE = 8;

  // Object.create(null): no Object.prototype chain, so a key like '__proto__' or
  // 'toString' can never resolve to an inherited value here.
  const DIRECTIONS = Object.assign(Object.create(null), {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  });

  function inBounds(row, col) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function createInteractionState() {
    return { cursor: { row: 0, col: 0 }, selection: null, target: null };
  }

  function moveCursor(state, [dr, dc]) {
    const row = state.cursor.row + dr;
    const col = state.cursor.col + dc;
    if (!inBounds(row, col)) return state;
    return { ...state, cursor: { row, col } };
  }

  function selectUnderCursor(state) {
    if (state.selection) return state;
    return { ...state, selection: { ...state.cursor } };
  }

  function designateTarget(state, [dr, dc]) {
    const row = state.selection.row + dr;
    const col = state.selection.col + dc;
    if (!inBounds(row, col)) return state;
    return { ...state, target: { row, col } };
  }

  function cancelSelection(state) {
    if (!state.selection) return state;
    return { cursor: { ...state.selection }, selection: null, target: null };
  }

  function handleKey(state, key) {
    const direction = DIRECTIONS[key];
    if (direction) {
      return state.selection ? designateTarget(state, direction) : moveCursor(state, direction);
    }
    if (key === ' ') {
      return selectUnderCursor(state);
    }
    if (key === 'Escape') {
      return cancelSelection(state);
    }
    return state;
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.createInteractionState = createInteractionState;
  global.MagicGems.handleKey = handleKey;
})(typeof window !== 'undefined' ? window : globalThis);
