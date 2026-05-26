import { describe, expect, test } from 'bun:test';
import { disableColors } from './colors.ts';
import { App } from './model.ts';
import { renderFooter, renderListView } from './render.ts';
import type { Rect, Session } from './types.ts';

disableColors();

function makeSession(name: string, opts?: Partial<Session>): Session {
  return {
    id: `$${name}`,
    name,
    attached: false,
    windowCount: 1,
    currentWindow: 'zsh',
    lastActivity: null,
    preview: [],
    previewError: null,
    ...opts,
  };
}

describe('renderListView', () => {
  const area: Rect = { x: 0, y: 0, width: 60, height: 10 };

  test('renders session rows without preview pane when narrow', () => {
    const app = new App([makeSession('dev'), makeSession('logs')], null);
    app.viewMode = 'list';
    const output = renderListView(app, area);
    expect(output).toContain('dev');
    expect(output).toContain('logs');
  });

  test('selected session gets arrow indicator', () => {
    const app = new App([makeSession('dev'), makeSession('logs')], null);
    app.viewMode = 'list';
    app.selectedIndex = 0;
    const output = renderListView(app, area);
    expect(output).toContain('▸');
  });

  test('shows preview pane when terminal is wide enough', () => {
    const wideArea: Rect = { x: 0, y: 0, width: 120, height: 10 };
    const app = new App(
      [makeSession('dev', { preview: ['$ echo hello', 'hello'], currentWindow: 'zsh', windowCount: 2 })],
      null,
    );
    app.viewMode = 'list';
    const output = renderListView(app, wideArea);
    expect(output).toContain('│');
    expect(output).toContain('hello');
  });

  test('shows create mode entry when no sessions match', () => {
    const app = new App([makeSession('dev')], null);
    app.viewMode = 'list';
    app.startSearch();
    app.pushSearchChar('z');
    app.pushSearchChar('z');
    expect(app.isCreateMode()).toBe(true);
    const output = renderListView(app, area);
    expect(output).toContain('Create:');
    expect(output).toContain('zz');
  });
});

describe('renderFooter with viewMode', () => {
  test('shows Tab hint for list mode in grid view', () => {
    const output = renderFooter(null, 120, 'grid');
    expect(output).toContain('Tab');
    expect(output).toContain('list');
  });

  test('shows Tab hint for grid mode in list view', () => {
    const output = renderFooter(null, 120, 'list');
    expect(output).toContain('Tab');
    expect(output).toContain('grid');
  });

  test('shows Tab hint during search', () => {
    const output = renderFooter('foo', 120, 'grid');
    expect(output).toContain('Tab');
  });

  test('shows create hint when no sessions', () => {
    const output = renderFooter(null, 120, 'grid', false);
    expect(output).toContain('create');
    expect(output).not.toContain('filter');
  });
});
