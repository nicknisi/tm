import packageJson from './package.json' with { type: 'json' };
import { handleKey, handleListMouse, handleMouse, parseKeyEvent } from './src/input.ts';
import { App } from './src/model.ts';
import { isMouseSequence, parseMouseEvent } from './src/mouse.ts';
import { render } from './src/render.ts';
import {
  enableMouse,
  enterAlternateScreen,
  enterRawMode,
  getTerminalSize,
  hideCursor,
  restore,
} from './src/terminal.ts';
import {
  attachSession,
  currentSessionId as getCurrentSessionId,
  currentSessionName as getCurrentSessionName,
  killSession,
  listSessions,
  newSession,
  switchClient,
} from './src/tmux.ts';
import { calculateGrid, FOOTER_HEIGHT } from './src/grid.ts';

const VERSION: string = packageJson.version;
const REFRESH_INTERVAL_MS = 500;

function handleCliFlags(argv: string[]): number | null {
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`tm ${VERSION}\n`);
    return 0;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      [
        'tm — grid-based tmux session switcher',
        '',
        'Usage:',
        '  tm                Launch the session switcher TUI',
        '  tm --version, -v  Print version and exit',
        '  tm --help, -h     Show this help and exit',
        '',
        'Keybindings (inside the TUI):',
        '  Arrows / Ctrl-HJKL Move selection',
        '  Type to filter    Live search by session name',
        '  Backspace         Delete a filter character',
        '  Enter             Switch (or create) the session',
        '  Tab               Toggle between grid and list view',
        '  Ctrl-D            Kill the selected session',
        '  Mouse click       Switch to the clicked session',
        '  Esc               Clear filter, or quit if filter is empty',
        '  Ctrl-C            Quit',
        '',
      ].join('\n'),
    );
    return 0;
  }
  return null;
}

async function main(): Promise<number> {
  const cliResult = handleCliFlags(process.argv.slice(2));
  if (cliResult !== null) return cliResult;

  let currentName: string | null = null;
  let currentId: string | null = null;
  let app: App;
  // Only ask tmux for the "current" session when we're actually inside a tmux
  // client. The $TMUX env var is the canonical signal — `tmux display-message`
  // happily reports the most-recently-active session even when no client is
  // attached, which would make us wrongly think we're inside tmux and try to
  // switch-client (failing with "no current client") instead of attaching.
  if (process.env.TMUX) {
    try {
      currentName = getCurrentSessionName();
      currentId = getCurrentSessionId();
    } catch {
      // Tmux not running — fall through with empty sessions/error.
    }
  }

  try {
    const sessions = listSessions(currentId);
    app = new App(sessions, currentName);
  } catch (err) {
    app = new App([], currentName);
    app.error = err instanceof Error ? err.message : String(err);
  }

  enterAlternateScreen();
  hideCursor();
  enterRawMode();
  enableMouse();

  const stdin = process.stdin;
  // Important: we receive raw bytes so mouse parsing works. Don't set utf8 encoding.

  let needsRender = true;
  const exitCode = 0;

  const draw = () => {
    const size = getTerminalSize();
    process.stdout.write(render(app, size));
  };

  const refreshSessions = (): void => {
    if (app.error) return;
    try {
      const sessions = listSessions(currentId);
      app.replaceSessions(sessions);
      needsRender = true;
    } catch {
      // Swallow refresh errors silently — next tick may succeed.
    }
  };

  const tryHandleSwitch = (): boolean => {
    if (!app.shouldSwitch) return false;
    const session = app.selectedSession();
    if (!session) {
      app.shouldSwitch = false;
      return false;
    }
    if (app.currentSessionName === session.name) {
      return true; // already there, just exit
    }
    try {
      restore();
      if (currentId !== null) {
        // Inside tmux: switch the current client to the target session.
        switchClient(session.id);
      } else {
        // Outside tmux: attach to the target session (switch-client has no
        // client to act on when we're not already inside tmux).
        attachSession(session.id);
      }
      return true;
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
      app.shouldSwitch = false;
      enterAlternateScreen();
      hideCursor();
      enterRawMode();
      enableMouse();
      needsRender = true;
      return false;
    }
  };

  const tryHandleCreate = (): boolean => {
    if (!app.shouldCreate) return false;
    const name = app.pendingCreateName();
    app.shouldCreate = false;
    if (!name) return false;
    try {
      newSession(name);
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
      needsRender = true;
      return false;
    }

    // Switch to the new session. If we're outside tmux, attach instead.
    try {
      if (currentId !== null) {
        // Inside tmux: switch the current client.
        restore();
        switchClient(name);
      } else {
        // Outside tmux: attach.
        restore();
        attachSession(name);
      }
      return true;
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
      enterAlternateScreen();
      hideCursor();
      enterRawMode();
      enableMouse();
      needsRender = true;
      return false;
    }
  };

  const tryHandleDelete = (): void => {
    if (!app.shouldDelete) return;
    app.shouldDelete = false;
    const session = app.selectedSession();
    if (!session) return;
    // Refuse to kill the session running tm.
    if (currentId !== null && session.id === currentId) {
      app.error = 'Cannot kill the current session (running tm).';
      needsRender = true;
      return;
    }
    try {
      killSession(session.id);
      // After killing, refresh the list immediately.
      refreshSessions();
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
      needsRender = true;
    }
  };

  return await new Promise<number>((resolve) => {
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const finish = (code: number) => {
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      stdin.removeAllListeners('data');
      restore();
      resolve(code);
    };

    const tick = () => {
      tryHandleDelete();
      if (needsRender) {
        draw();
        needsRender = false;
      }
      if (app.shouldQuit) {
        finish(exitCode);
        return;
      }
      if (tryHandleCreate()) {
        finish(exitCode);
        return;
      }
      if (tryHandleSwitch()) {
        finish(exitCode);
        return;
      }
    };

    const handleInput = (buf: Buffer) => {
      const size = getTerminalSize();
      const contentArea = { x: 0, y: 0, width: size.cols, height: Math.max(0, size.rows - FOOTER_HEIGHT) };

      if (isMouseSequence(buf)) {
        const mouse = parseMouseEvent(buf);
        if (mouse !== null) {
          const visible = app.visibleSessions();
          if (visible.length > 0) {
            if (app.viewMode === 'list') {
              handleListMouse(app, mouse, contentArea);
            } else {
              const grid = calculateGrid(contentArea, visible.length);
              handleMouse(app, mouse, grid.cards);
            }
          }
          needsRender = true;
        }
        return;
      }

      const key = parseKeyEvent(buf);
      const hadError = app.error !== null;
      if (app.viewMode === 'list') {
        handleKey(app, key, 1);
      } else {
        const grid = calculateGrid(contentArea, app.visibleSessionCount());
        handleKey(app, key, grid.columns);
      }
      if (hadError && app.error === null) {
        refreshSessions();
      }
      needsRender = true;
    };

    stdin.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      handleInput(buf);
      tick();
    });

    process.stdout.on('resize', () => {
      // Clamp selection if the new grid is smaller (replaceSessions handles
      // out-of-range index by clamping, but selection is by name preserved
      // anyway). Just trigger a redraw — the renderer reads the new size.
      needsRender = true;
      tick();
    });

    // Also handle SIGWINCH directly (process.stdout 'resize' covers most cases
    // but SIGWINCH is the canonical signal).
    process.on('SIGWINCH', () => {
      needsRender = true;
      tick();
    });

    refreshTimer = setInterval(() => {
      refreshSessions();
      if (needsRender) {
        tick();
      }
    }, REFRESH_INTERVAL_MS);

    // Initial draw.
    tick();
  });
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    restore();
    console.error(err);
    process.exit(1);
  });
