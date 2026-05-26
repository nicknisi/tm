import { describe, expect, test } from 'bun:test';
import { handleKey, handleListMouse, handleMouse, parseKeyEvent } from './input.ts';
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

describe('parseKeyEvent - tab', () => {
  test('tab byte returns tab event', () => {
    const event = parseKeyEvent(Buffer.from([0x09]));
    expect(event.type).toBe('tab');
  });
});

describe('handleKey - tab toggles view mode', () => {
  test('tab toggles from grid to list', () => {
    const app = new App([makeSession('one')], null);
    expect(app.viewMode).toBe('grid');
    handleKey(app, key('tab'), 1);
    expect(app.viewMode).toBe('list');
  });

  test('tab toggles during search mode', () => {
    const app = new App([makeSession('one')], null);
    app.startSearch();
    app.pushSearchChar('o');
    handleKey(app, key('tab'), 1);
    expect(app.viewMode).toBe('list');
    expect(app.isSearching()).toBe(true);
  });
});

describe('handleKey - Ctrl+HJKL navigation', () => {
  test('Ctrl-H moves left', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    app.selectedIndex = 1;
    handleKey(app, ctrl('h'), 3);
    expect(app.selectedIndex).toBe(0);
  });

  test('Ctrl-L moves right', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    handleKey(app, ctrl('l'), 3);
    expect(app.selectedIndex).toBe(1);
  });

  test('Ctrl-J moves down', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c'), makeSession('d')], null);
    handleKey(app, ctrl('j'), 2);
    expect(app.selectedIndex).toBe(2);
  });

  test('Ctrl-K moves up', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c'), makeSession('d')], null);
    app.selectedIndex = 2;
    handleKey(app, ctrl('k'), 2);
    expect(app.selectedIndex).toBe(0);
  });

  test('Ctrl+HJKL works in search mode for navigation', () => {
    const app = new App([makeSession('alpha'), makeSession('also'), makeSession('ant')], null);
    app.startSearch();
    app.pushSearchChar('a');
    handleKey(app, ctrl('j'), 1);
    expect(app.selectedIndex).toBe(1);
    expect(app.isSearching()).toBe(true);
  });

  test('Ctrl-H is clamped at row start', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    app.selectedIndex = 0;
    handleKey(app, ctrl('h'), 3);
    expect(app.selectedIndex).toBe(0);
  });
});

describe('parseKeyEvent - Ctrl+H/J disambiguation', () => {
  test('0x08 parses as Ctrl-H, not backspace', () => {
    const event = parseKeyEvent(Buffer.from([0x08]));
    expect(event).toEqual({ type: 'ctrl', char: 'h' });
  });

  test('0x7f still parses as backspace', () => {
    const event = parseKeyEvent(Buffer.from([0x7f]));
    expect(event).toEqual({ type: 'backspace' });
  });

  test('0x0a parses as Ctrl-J, not enter', () => {
    const event = parseKeyEvent(Buffer.from([0x0a]));
    expect(event).toEqual({ type: 'ctrl', char: 'j' });
  });

  test('0x0d still parses as enter', () => {
    const event = parseKeyEvent(Buffer.from([0x0d]));
    expect(event).toEqual({ type: 'enter' });
  });
});

describe('handleKey - list mode navigation', () => {
  test('up/down in list mode navigates one at a time', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    app.viewMode = 'list';
    handleKey(app, { type: 'arrow', direction: 'down' }, 1);
    expect(app.selectedIndex).toBe(1);
    handleKey(app, { type: 'arrow', direction: 'down' }, 1);
    expect(app.selectedIndex).toBe(2);
    handleKey(app, { type: 'arrow', direction: 'up' }, 1);
    expect(app.selectedIndex).toBe(1);
  });
});

describe('handleListMouse', () => {
  function mouse(button: MouseEvent['button'], x: number, y: number, type: MouseEvent['type'] = 'press'): MouseEvent {
    return { button, x, y, type };
  }

  const area: Rect = { x: 0, y: 0, width: 80, height: 20 };

  test('left click on a row selects and switches', () => {
    const app = new App([makeSession('a'), makeSession('b'), makeSession('c')], null);
    handleListMouse(app, mouse('left', 5, 3), area);
    expect(app.selectedIndex).toBe(2);
    expect(app.shouldSwitch).toBe(true);
  });

  test('click outside session rows does nothing', () => {
    const app = new App([makeSession('a'), makeSession('b')], null);
    handleListMouse(app, mouse('left', 5, 15), area);
    expect(app.shouldSwitch).toBe(false);
  });

  test('right click is ignored', () => {
    const app = new App([makeSession('a')], null);
    handleListMouse(app, mouse('right', 5, 1), area);
    expect(app.shouldSwitch).toBe(false);
  });
});
