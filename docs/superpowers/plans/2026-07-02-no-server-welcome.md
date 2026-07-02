# No-Server Welcome Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launching `tm` with no tmux server shows a friendly welcome screen (not a raw tmux error), and all error states become dismissible.

**Architecture:** Three small changes along the existing layering: `src/tmux.ts` (subprocess boundary) learns that "no server" is an empty list, not an error; `src/render.ts` (pure string rendering) gains a styled welcome screen and an error-dismissal hint; `src/input.ts` (pure state transitions) clears `app.error` on any non-quit key. `index.ts` only loses its error-suffix templates and refreshes after a dismissal.

**Tech Stack:** Bun + TypeScript, `bun:test`, oxlint/oxfmt. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-no-server-welcome-design.md`

## Global Constraints

- No new dependencies.
- Tests use `bun:test` with the existing file-local `makeSession` helpers; render tests rely on `disableColors()` already called at the top of `src/render.test.ts`.
- Copy strings verbatim: welcome lines `tm` / `No sessions running.` / `Type a name and press Enter` / `to create your first session.`; error hint `Press any key to continue · Esc/Ctrl-C quits`.
- Conventional commit messages (`fix:` / `feat:`), matching repo history.
- After each task: `bun test`, `bunx tsc --noEmit` must pass.

---

### Task 1: Treat "no server" as zero sessions

**Files:**
- Create: `src/tmux.test.ts`
- Modify: `src/tmux.ts:82-91` (`listSessions`), add exported helper above it

**Interfaces:**
- Produces: `isNoServerError(stderr: string): boolean` (exported from `src/tmux.ts`); `listSessions()` now returns `[]` when the tmux server is not running.

- [ ] **Step 1: Write the failing test**

Create `src/tmux.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { isNoServerError } from './tmux.ts';

describe('isNoServerError', () => {
  test('matches "error connecting to" (tmux 3.x)', () => {
    expect(isNoServerError('error connecting to /private/tmp/tmux-501/default (No such file or directory)')).toBe(
      true,
    );
  });

  test('matches "no server running" (other tmux versions)', () => {
    expect(isNoServerError('no server running on /tmp/tmux-1000/default')).toBe(true);
  });

  test('rejects unrelated tmux errors', () => {
    expect(isNoServerError('unknown option: -Z')).toBe(false);
    expect(isNoServerError('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tmux.test.ts`
Expected: FAIL — `isNoServerError` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/tmux.ts`, insert directly above `export function listSessions`:

```ts
const NO_SERVER_PATTERN = /no server running|error connecting to/;

/**
 * True when tmux stderr means "the server just isn't running" — an expected
 * state (tmux kills its server when the last session ends), not a failure.
 * tmux does not localize messages; these are the two variants across versions.
 */
export function isNoServerError(stderr: string): boolean {
  return NO_SERVER_PATTERN.test(stderr);
}
```

Then change the top of `listSessions`:

```ts
export function listSessions(currentSessionId?: string | null): Session[] {
  const result = run(['list-sessions', '-F', SESSION_FORMAT]);
  if (result.exitCode !== 0) {
    if (isNoServerError(result.stderr)) return [];
    throw new Error(tmuxError('tmux list-sessions failed', result.stderr));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/tmux.ts src/tmux.test.ts
git commit -m "fix: treat missing tmux server as zero sessions, not an error"
```

---

### Task 2: Welcome screen for the empty state

**Files:**
- Modify: `src/render.ts:59-62` (empty branch), `src/render.ts:392-407` (`renderCenteredMessage`), add `renderCenteredLines` + `renderWelcome`
- Test: `src/render.test.ts` (new describe block; also add `render` to the existing import)

**Interfaces:**
- Consumes: nothing from Task 1 (pure rendering).
- Produces: `renderWelcome(area: Rect): string` and private `renderCenteredLines(area: Rect, lines: string[]): string` in `src/render.ts`. Task 3 reuses `renderCenteredLines` for the error screen.

- [ ] **Step 1: Write the failing test**

In `src/render.test.ts`, change the render import line to:

```ts
import { render, renderFooter, renderListView } from './render.ts';
```

Append at the end of the file:

```ts
describe('render with no sessions', () => {
  test('shows welcome screen instead of an error-style message', () => {
    const app = new App([], null);
    const output = render(app, { cols: 80, rows: 24 });
    expect(output).toContain('No sessions running.');
    expect(output).toContain('Type a name and press Enter');
    expect(output).toContain('to create your first session.');
  });

  test('typing still morphs into the create card', () => {
    const app = new App([], null);
    app.startSearch();
    app.pushSearchChar('a');
    const output = render(app, { cols: 80, rows: 24 });
    expect(output).toContain('Create:');
    expect(output).not.toContain('No sessions running.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/render.test.ts`
Expected: FAIL — output contains `No tmux sessions found.`, not the new copy.

- [ ] **Step 3: Implement**

In `src/render.ts`, replace the body of `renderCenteredMessage` with a delegation and add the two new functions (keep `renderCenteredMessage`'s existing callers working):

```ts
function renderCenteredLines(area: Rect, lines: string[]): string {
  const out: string[] = [];
  const startRow = area.y + Math.max(0, Math.floor((area.height - lines.length) / 2));
  for (let i = 0; i < lines.length; i += 1) {
    const truncated = truncateAnsi(lines[i]!, area.width);
    const len = visibleLength(truncated);
    const startCol = area.x + Math.max(0, Math.floor((area.width - len) / 2));
    out.push(moveCursor(startRow + i + 1, startCol + 1));
    out.push(truncated);
    out.push(C.reset);
  }
  return out.join('');
}

function renderCenteredMessage(area: Rect, message: string): string {
  return renderCenteredLines(
    area,
    message.split('\n').map((line) => `${C.gray}${line}${C.reset}`),
  );
}

export function renderWelcome(area: Rect): string {
  return renderCenteredLines(area, [
    `${C.cyanBold}tm${C.reset}`,
    '',
    `${C.gray}No sessions running.${C.reset}`,
    '',
    `${C.gray}Type a name and press ${C.reset}${C.yellowBold}Enter${C.reset}`,
    `${C.gray}to create your first session.${C.reset}`,
  ]);
}
```

(`truncateAnsi` is ANSI-aware; the old `truncate()` would slice escape sequences mid-run, which is why the styled lines don't go through it.)

In `render()`, change the empty branch (`render.ts:61-62`):

```ts
  } else if (app.sessions.length === 0 && !app.isCreateMode()) {
    out.push(renderWelcome(contentArea));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render.ts src/render.test.ts
git commit -m "feat: styled welcome screen when no sessions exist"
```

---

### Task 3: Dismissible error states

**Files:**
- Modify: `src/input.ts:59-71` (top of `handleKey`), `src/render.ts:59-60` (error branch), `index.ts:87,139,158,176,193,202` (drop suffix templates), `index.ts:261-268` (refresh after dismissal)
- Test: `src/input.test.ts`, `src/render.test.ts`

**Interfaces:**
- Consumes: `renderCenteredLines(area, lines)` from Task 2.
- Produces: behavior only — `handleKey` clears `app.error` on any key except Esc/Ctrl-C (which quit); `app.error` now holds only the message, no "Press Esc…" suffix.

- [ ] **Step 1: Write the failing tests**

Append to `src/input.test.ts` (the file already defines `makeSession` and `ctrl`):

```ts
describe('error dismissal', () => {
  test('any key dismisses an error without side effects', () => {
    const app = new App([makeSession('dev')], null);
    app.error = 'boom';
    handleKey(app, { type: 'char', char: 'j' }, 1);
    expect(app.error).toBeNull();
    expect(app.isSearching()).toBe(false);
    expect(app.shouldQuit).toBe(false);
  });

  test('escape quits while an error is shown', () => {
    const app = new App([makeSession('dev')], null);
    app.error = 'boom';
    handleKey(app, { type: 'escape' }, 1);
    expect(app.shouldQuit).toBe(true);
  });

  test('ctrl-c quits while an error is shown', () => {
    const app = new App([makeSession('dev')], null);
    app.error = 'boom';
    handleKey(app, ctrl('c'), 1);
    expect(app.shouldQuit).toBe(true);
  });

  test('ctrl-d is consumed by error dismissal, not delete', () => {
    const app = new App([makeSession('dev')], null);
    app.error = 'boom';
    handleKey(app, ctrl('d'), 1);
    expect(app.shouldDelete).toBe(false);
    expect(app.error).toBeNull();
  });
});
```

Append to `src/render.test.ts`:

```ts
describe('render with error', () => {
  test('shows the message and a dismissal hint', () => {
    const app = new App([], null);
    app.error = 'something failed';
    const output = render(app, { cols: 80, rows: 24 });
    expect(output).toContain('something failed');
    expect(output).toContain('Press any key to continue');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/input.test.ts src/render.test.ts`
Expected: FAIL — `handleKey` treats 'j' as a filter char (search starts, error survives); render output lacks the hint line.

- [ ] **Step 3: Implement**

`src/input.ts` — insert into `handleKey` after the Ctrl-C block (line 64) and before the Ctrl-D block:

```ts
  // An on-screen error: Esc quits, any other key dismisses it (consumed).
  if (app.error !== null) {
    if (key.type === 'escape') {
      app.shouldQuit = true;
      return;
    }
    app.error = null;
    return;
  }
```

`src/render.ts` — replace the error branch in `render()` (lines 59-60):

```ts
  if (app.error) {
    const lines = app.error.split('\n').map((line) => `${C.gray}${line}${C.reset}`);
    lines.push('');
    lines.push(
      `${C.gray}Press any key to continue · ${C.reset}${C.yellowBold}Esc/Ctrl-C${C.reset}${C.gray} quits${C.reset}`,
    );
    out.push(renderCenteredLines(contentArea, lines));
  } else if (app.sessions.length === 0 && !app.isCreateMode()) {
```

`index.ts` — five sites lose the suffix; the kill-guard message shortens. Exact replacements:

Line 87 (and identically 139, 158, 176, 202):

```ts
      app.error = err instanceof Error ? err.message : String(err);
```

Line 193:

```ts
      app.error = 'Cannot kill the current session (running tm).';
```

`index.ts` — in `handleInput`, refresh immediately when a key dismissed the error (replace the key-handling tail, currently lines 261-268):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/input.ts src/input.test.ts src/render.ts src/render.test.ts index.ts
git commit -m "fix: make error states dismissible instead of dead ends"
```

---

### Task 4: Integration verification (no code)

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `bun test && bunx tsc --noEmit && bunx oxlint && bunx oxfmt --check .`
Expected: all pass. If oxfmt flags formatting, run `bunx oxfmt .` and amend the last commit.

- [ ] **Step 2: End-to-end — welcome screen on a serverless socket**

Everything isolated: the harness tmux runs on socket `-L tm-e2e`; the tm-under-test talks to an empty `TMUX_TMPDIR` (no server there). Nothing touches the user's default tmux server.

```bash
SOCKDIR=$(mktemp -d)
tmux -L tm-e2e new-session -d -s harness -x 100 -y 30 \
  "env -u TMUX TMUX_TMPDIR=$SOCKDIR bun run /Users/nicknisi/Developer/tm/index.ts"
sleep 1
tmux -L tm-e2e capture-pane -p -t harness
```

Expected: the welcome copy — `tm`, `No sessions running.`, `Type a name and press Enter`, `to create your first session.` — and the footer `type a name to create · Esc/Ctrl-C quit`. NOT `tmux list-sessions failed`.

- [ ] **Step 3: End-to-end — create flow starts the server**

```bash
tmux -L tm-e2e send-keys -t harness demo
sleep 0.5
tmux -L tm-e2e capture-pane -p -t harness   # expect the "Create: demo" card
tmux -L tm-e2e send-keys -t harness Enter
sleep 1
TMUX_TMPDIR=$SOCKDIR tmux list-sessions      # expect: demo: 1 windows ...
```

Expected: `demo` exists on the isolated server; the harness pane is now attached inside it (capture shows a shell prompt).

- [ ] **Step 4: Cleanup**

```bash
TMUX_TMPDIR=$SOCKDIR tmux kill-server 2>/dev/null
tmux -L tm-e2e kill-server 2>/dev/null
rm -rf "$SOCKDIR"
```

- [ ] **Step 5: Error-dismissal spot check**

Covered by unit tests (input/render). No manual step — the only reliably reproducible real error requires uninstalling tmux, which is out of scope.
