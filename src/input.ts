import { App } from './model.ts';
import type { KeyEvent } from './types.ts';

export function parseKeyEvent(data: Buffer): KeyEvent {
  if (data.length === 0) return { type: 'unknown' };

  const first = data[0]!;

  // Escape sequence (arrows, etc.)
  if (first === 0x1b) {
    if (data.length === 1) return { type: 'escape' };
    if (data.length >= 3 && data[1] === 0x5b /* '[' */) {
      const final = data[2];
      switch (final) {
        case 0x41 /* A */:
          return { type: 'arrow', direction: 'up' };
        case 0x42 /* B */:
          return { type: 'arrow', direction: 'down' };
        case 0x43 /* C */:
          return { type: 'arrow', direction: 'right' };
        case 0x44 /* D */:
          return { type: 'arrow', direction: 'left' };
        default:
          return { type: 'unknown' };
      }
    }
    return { type: 'escape' };
  }

  // Enter (CR or LF)
  if (first === 0x0d || first === 0x0a) return { type: 'enter' };
  // Backspace / DEL
  if (first === 0x7f || first === 0x08) return { type: 'backspace' };
  // Tab is not handled — fall through to unknown for now
  if (first === 0x09) return { type: 'unknown' };

  // Control characters (Ctrl-A..Ctrl-Z except CR/LF/Tab/BS handled above)
  if (first >= 0x01 && first <= 0x1a) {
    const char = String.fromCharCode(first + 0x60);
    return { type: 'ctrl', char };
  }

  // Printable ASCII + extended (multi-byte UTF-8 first byte)
  if (first >= 0x20 && first <= 0x7e) {
    return { type: 'char', char: String.fromCharCode(first) };
  }

  // UTF-8 multi-byte
  if (first >= 0xc0) {
    return { type: 'char', char: data.toString('utf8') };
  }

  return { type: 'unknown' };
}

/**
 * Apply a key event to the app state. `columns` is the current grid column count
 * used for arrow-key clamping on row edges (mirrors tmux.expose's input.rs).
 */
export function handleKey(app: App, key: KeyEvent, columns: number): void {
  // Ctrl-C always quits.
  if (key.type === 'ctrl' && key.char === 'c') {
    app.shouldQuit = true;
    return;
  }
  // Ctrl-D also quits.
  if (key.type === 'ctrl' && key.char === 'd') {
    app.shouldQuit = true;
    return;
  }

  if (app.isSearching()) {
    handleSearchKey(app, key, columns);
    return;
  }

  switch (key.type) {
    case 'escape':
      app.shouldQuit = true;
      return;
    case 'enter':
      app.shouldSwitch = true;
      return;
    case 'arrow':
      switch (key.direction) {
        case 'left':
          moveLeftClamped(app, columns);
          return;
        case 'right':
          moveRightClamped(app, columns);
          return;
        case 'up':
          app.moveUp(columns);
          return;
        case 'down':
          app.moveDown(columns);
          return;
      }
      return;
    case 'char':
      pushFilterChar(app, key.char);
      return;
    default:
      return;
  }
}

function handleSearchKey(app: App, key: KeyEvent, columns: number): void {
  switch (key.type) {
    case 'escape':
      if (app.searchText() === '') {
        app.shouldQuit = true;
      } else {
        app.clearSearch();
      }
      return;
    case 'enter':
      app.shouldSwitch = true;
      return;
    case 'backspace':
      app.popSearchChar();
      return;
    case 'arrow':
      switch (key.direction) {
        case 'left':
          moveLeftClamped(app, columns);
          return;
        case 'right':
          moveRightClamped(app, columns);
          return;
        case 'up':
          app.moveUp(columns);
          return;
        case 'down':
          app.moveDown(columns);
          return;
      }
      return;
    case 'char':
      pushFilterChar(app, key.char);
      return;
    default:
      return;
  }
}

function pushFilterChar(app: App, ch: string): void {
  if (!app.isSearching()) {
    app.startSearch();
  }
  app.pushSearchChar(ch);
}

function moveLeftClamped(app: App, columns: number): void {
  const cols = Math.max(1, columns);
  if (app.selectedIndex % cols !== 0) {
    app.moveLeft();
  }
}

function moveRightClamped(app: App, columns: number): void {
  const cols = Math.max(1, columns);
  if (app.selectedIndex % cols !== cols - 1) {
    app.moveRight();
  }
}
