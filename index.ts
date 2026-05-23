import packageJson from './package.json' with { type: 'json' };
import { handleKey, parseKeyEvent } from './src/input.ts';
import { App } from './src/model.ts';
import { render } from './src/render.ts';
import { enterAlternateScreen, enterRawMode, getTerminalSize, hideCursor, restore } from './src/terminal.ts';
import {
  currentSessionId as getCurrentSessionId,
  currentSessionName as getCurrentSessionName,
  listSessions,
  switchClient,
} from './src/tmux.ts';
import { calculateGrid, FOOTER_HEIGHT } from './src/grid.ts';

const VERSION: string = packageJson.version;

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
        '  Arrows            Move selection',
        '  Type to filter    Live search by session name',
        '  Backspace         Delete a filter character',
        '  Enter             Switch to selected session',
        '  Esc               Clear filter, or quit if filter is empty',
        '  Ctrl-C / Ctrl-D   Quit',
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
  try {
    currentName = getCurrentSessionName();
    currentId = getCurrentSessionId();
  } catch {
    // Tmux not running — fall through with empty sessions/error.
  }

  try {
    const sessions = listSessions(currentId);
    app = new App(sessions, currentName);
  } catch (err) {
    app = new App([], currentName);
    app.error = `${err instanceof Error ? err.message : String(err)}\n\nPress Esc or Ctrl-C to quit.`;
  }

  enterAlternateScreen();
  hideCursor();
  enterRawMode();

  const stdin = process.stdin;
  stdin.setEncoding('utf8');

  let needsRender = true;
  let exitCode = 0;

  const draw = () => {
    const size = getTerminalSize();
    process.stdout.write(render(app, size));
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
      switchClient(session.id);
      return true;
    } catch (err) {
      app.error = `${err instanceof Error ? err.message : String(err)}\n\nPress Esc or Ctrl-C to quit.`;
      app.shouldSwitch = false;
      enterAlternateScreen();
      hideCursor();
      enterRawMode();
      needsRender = true;
      return false;
    }
  };

  return await new Promise<number>((resolve) => {
    const finish = (code: number) => {
      stdin.removeAllListeners('data');
      restore();
      resolve(code);
    };

    const tick = () => {
      if (needsRender) {
        draw();
        needsRender = false;
      }
      if (app.shouldQuit) {
        finish(exitCode);
        return;
      }
      if (tryHandleSwitch()) {
        finish(exitCode);
        return;
      }
    };

    stdin.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      const key = parseKeyEvent(buf);
      const size = getTerminalSize();
      const gridArea = { x: 0, y: 0, width: size.cols, height: Math.max(0, size.rows - FOOTER_HEIGHT) };
      const grid = calculateGrid(gridArea, app.visibleSessionCount());
      handleKey(app, key, grid.columns);
      needsRender = true;
      tick();
    });

    process.stdout.on('resize', () => {
      needsRender = true;
      tick();
    });

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
