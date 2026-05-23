import { describe, expect, test } from 'bun:test';
import { handleKey, handleMouse } from './input.ts';
import { App } from './model.ts';
import type { KeyEvent, MouseEvent, Rect, Session } from './types.ts';

function makeSession(name: string): Session {
  return {
    id: `$${name}`,
    name,
    attached: false,
    windowCount: 1,
    currentWindow: null,
    lastActivity: null,
    preview: [],
    previewError: null,
  };
}

function ctrl(char: string): KeyEvent {
  return { type: 'ctrl', char };
}

function key(type: KeyEvent['type'], extra?: Partial<KeyEvent>): KeyEvent {
  return { type, ...extra } as KeyEvent;
}

describe('handleKey - Ctrl-D', () => {
  test('Ctrl-D sets shouldDelete when a session is selected', () => {
    const app = new App([makeSession('one'), makeSession('two')], null);
    handleKey(app, ctrl('d'), 2);
    expect(app.shouldDelete).toBe(true);
    expect(app.shouldQuit).toBe(false);
  });

  test('Ctrl-D does nothing when no session is selected', () => {
    const app = new App([], null);
    handleKey(app, ctrl('d'), 1);
    expect(app.shouldDelete).toBe(false);
  });

  test('Ctrl-C always quits', () => {
    const app = new App([makeSession('one')], null);
    handleKey(app, ctrl('c'), 1);
    expect(app.shouldQuit).toBe(true);
    expect(app.shouldDelete).toBe(false);
  });
});

describe('handleKey - create mode', () => {
  test('Enter in create mode sets shouldCreate, not shouldSwitch', () => {
    const app = new App([makeSession('backend')], null);
    app.startSearch();
    app.pushSearchChar('z');
    expect(app.isCreateMode()).toBe(true);

    handleKey(app, key('enter'), 1);

    expect(app.shouldCreate).toBe(true);
    expect(app.shouldSwitch).toBe(false);
  });

  test('Enter on matching session sets shouldSwitch', () => {
    const app = new App([makeSession('backend')], null);
    app.startSearch();
    app.pushSearchChar('b');

    handleKey(app, key('enter'), 1);

    expect(app.shouldSwitch).toBe(true);
    expect(app.shouldCreate).toBe(false);
  });
});

describe('handleMouse', () => {
  const cards: Rect[] = [
    { x: 0, y: 0, width: 10, height: 5 },
    { x: 12, y: 0, width: 10, height: 5 },
    { x: 0, y: 7, width: 10, height: 5 },
  ];

  function mouse(button: MouseEvent['button'], x: number, y: number, type: MouseEvent['type'] = 'press'): MouseEvent {
    return { button, x, y, type };
  }

  test('left press on a card sets selection and switch flag', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    // x=5,y=2 in 0-based coords -> mouse coords 6,3 (1-based).
    handleMouse(app, mouse('left', 6, 3), cards);
    expect(app.selectedIndex).toBe(0);
    expect(app.shouldSwitch).toBe(true);
  });

  test('click on second card selects index 1', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    handleMouse(app, mouse('left', 15, 2), cards); // inside cards[1]
    expect(app.selectedIndex).toBe(1);
    expect(app.shouldSwitch).toBe(true);
  });

  test('click outside any card does nothing', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    app.selectedIndex = 2;
    handleMouse(app, mouse('left', 50, 50), cards);
    expect(app.selectedIndex).toBe(2);
    expect(app.shouldSwitch).toBe(false);
  });

  test('right click is ignored', () => {
    const app = new App([makeSession('a')], null);
    handleMouse(app, mouse('right', 1, 1), cards);
    expect(app.shouldSwitch).toBe(false);
  });

  test('release event is ignored', () => {
    const app = new App([makeSession('a')], null);
    handleMouse(app, mouse('left', 1, 1, 'release'), cards);
    expect(app.shouldSwitch).toBe(false);
  });

  test('scroll events are ignored', () => {
    const app = new App([makeSession('a')], null);
    handleMouse(app, mouse('scroll-up', 1, 1), cards);
    expect(app.shouldSwitch).toBe(false);
  });
});
