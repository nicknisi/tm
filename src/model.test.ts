import { describe, expect, test } from 'bun:test';
import { App, fuzzyMatches } from './model.ts';
import type { Session } from './types.ts';

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

describe('App', () => {
  test('selects current session when present', () => {
    const app = new App([makeSession('dev'), makeSession('logs'), makeSession('notes')], 'logs');
    expect(app.selectedIndex).toBe(1);
  });

  test('clamps navigation at grid edges', () => {
    const app = new App([makeSession('one'), makeSession('two'), makeSession('three')], null);

    app.moveLeft();
    expect(app.selectedIndex).toBe(0);

    app.moveRight();
    app.moveRight();
    app.moveRight();
    expect(app.selectedIndex).toBe(2);

    app.moveDown(2);
    expect(app.selectedIndex).toBe(2);

    app.moveUp(2);
    expect(app.selectedIndex).toBe(0);
  });

  test('preserves selected session by name after refresh', () => {
    const app = new App([makeSession('dev'), makeSession('logs'), makeSession('notes')], null);
    app.selectedIndex = 1;

    app.replaceSessions([makeSession('new'), makeSession('logs'), makeSession('dev')]);

    expect(app.selectedSession()?.name).toBe('logs');
  });

  test('search filters sessions by fuzzy name', () => {
    const app = new App([makeSession('backend-api'), makeSession('frontend'), makeSession('database')], null);

    app.startSearch();
    app.pushSearchChar('b');
    app.pushSearchChar('a');

    const names = app.visibleSessions().map((s) => s.name);
    expect(names).toEqual(['backend-api', 'database']);
  });

  test('selected session uses filtered selection', () => {
    const app = new App([makeSession('backend'), makeSession('frontend'), makeSession('database')], null);

    app.startSearch();
    app.pushSearchChar('f');

    expect(app.selectedIndex).toBe(0);
    expect(app.selectedSession()?.name).toBe('frontend');
  });

  test('clearing search restores all sessions', () => {
    const app = new App([makeSession('backend'), makeSession('frontend')], null);

    app.startSearch();
    app.pushSearchChar('f');
    app.clearSearch();

    expect(app.isSearching()).toBe(false);
    expect(app.visibleSessionCount()).toBe(2);
  });

  test('up from first row keeps selection in place', () => {
    const app = new App([makeSession('one'), makeSession('two'), makeSession('three')], null);
    app.selectedIndex = 1;
    app.moveUp(2);
    expect(app.selectedIndex).toBe(1);
  });

  test('down to incomplete row selects nearest card', () => {
    const app = new App(
      [makeSession('one'), makeSession('two'), makeSession('three'), makeSession('four'), makeSession('five')],
      null,
    );
    app.selectedIndex = 2;
    app.moveDown(3);
    expect(app.selectedIndex).toBe(4);
  });
});

describe('fuzzyMatches', () => {
  test('matches subsequences', () => {
    expect(fuzzyMatches('backend-api', 'ba')).toBe(true);
    expect(fuzzyMatches('database', 'ba')).toBe(true);
    expect(fuzzyMatches('frontend', 'ba')).toBe(false);
  });

  test('is case insensitive', () => {
    expect(fuzzyMatches('Backend', 'be')).toBe(true);
    expect(fuzzyMatches('backend', 'BE')).toBe(true);
  });

  test('empty query matches anything', () => {
    expect(fuzzyMatches('anything', '')).toBe(true);
  });
});
