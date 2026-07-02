# No-server welcome screen — design

**Date:** 2026-07-02
**Status:** Proceeding with recommended options (user was away during brainstorm); design + implementation flagged for user review

## Problem

Launching `tm` when no tmux server is running shows a raw error page:

```
tmux list-sessions failed: error connecting to /private/tmp/tmux-501/default (No such file or directory)

Press Esc or Ctrl-C to quit.
```

Root cause: tmux kills its server when the last session ends, so "zero sessions"
almost always means "no server", and `tmux list-sessions` exits 1. `listSessions()`
throws on any non-zero exit (`src/tmux.ts`), startup catches it and sets `app.error`
(`index.ts`). The friendly empty state added in b0cbe0d (`render.ts`) only renders
when `listSessions` returns `[]` without throwing — a state that is nearly
unreachable in practice.

Adjacent bug: nothing ever clears `app.error`, and `refreshSessions()` early-returns
while it is set, so every error is a permanent dead end. One error message even says
"press any key to continue", which does nothing today.

## Goals

1. Launching with no tmux server shows a friendly welcome screen, not an error.
2. From that screen, typing a name + Enter creates the session (this already starts
   the server via `tmux new-session`) and attaches/switches.
3. Real errors (tmux missing, kill/create failures) are dismissible, not a trap.

Non-goals: pre-filled session-name suggestions, recent-session history, any change
to the create-card flow itself.

## Design

### 1. Treat "no server" as an empty session list (`src/tmux.ts`)

New exported helper:

```ts
export function isNoServerError(stderr: string): boolean
```

Returns true when stderr matches `/no server running|error connecting to/`
(the two messages tmux emits across versions; tmux does not localize).
`listSessions()` returns `[]` in that case instead of throwing. All other non-zero
exits still throw.

### 2. Welcome screen (`src/render.ts`)

The `sessions.length === 0 && !isCreateMode()` branch renders a styled centered
block instead of the plain gray two-liner:

```
              tm                      ← cyan bold

     No sessions running.             ← gray

  Type a name and press Enter         ← gray, "Enter" highlighted
  to create your first session.
```

Implementation: generalize centering into a helper that accepts pre-styled lines
and measures with `visibleLength`/`truncateAnsi` (the existing `truncate()` would
slice ANSI escapes mid-sequence). `renderCenteredMessage` delegates to it.
Typing still morphs into the existing cyan Create card — unchanged.

The existing no-sessions footer hint (`type a name to create · Esc/Ctrl-C quit`)
already covers the key hints; unchanged.

### 3. Dismissible errors (`src/input.ts` + `render.ts` + `index.ts`)

- `handleKey`: when `app.error` is set — Ctrl-C and Esc quit (unchanged); any other
  key clears the error and is consumed (does not also start a search).
  This lives in `input.ts` because that is the tested pure state layer.
- `render.ts` owns the hint line: error screen renders the message plus
  `Press any key to continue · Esc/Ctrl-C quits`. The six `\n\nPress Esc or
  Ctrl-C to quit.` template suffixes in `index.ts` are removed — `app.error`
  holds only the message.
- `index.ts`: when a key dismisses the error, call `refreshSessions()` so the list
  is current immediately (the 500 ms poll would otherwise leave a stale flash).

If the underlying condition persists (e.g. tmux not installed), the next action
re-raises the error; Esc/Ctrl-C always exit. Not a trap, by construction.

## Testing

- `src/tmux.test.ts` (new): `isNoServerError` accepts both tmux message variants,
  rejects other stderr.
- `src/render.test.ts`: empty sessions → output contains the welcome copy; `app.error`
  set → output contains message + dismissal hint.
- `src/input.test.ts`: with `app.error` set — printable key clears error, does not
  enter search; Esc sets `shouldQuit`; Ctrl-C sets `shouldQuit`.

## Alternatives considered

- **Minimal fix only** (route no-server to the existing gray message): smallest
  diff, but the user explicitly asked for "friendly", and the plain message reads
  terse. Rejected in favor of a small welcome panel.
- **Pre-filled session name from cwd basename**: fastest path to a first session,
  but guesses at intent and adds state logic. Rejected (YAGNI); easy follow-up.
- **Detect no-server by socket existence instead of stderr matching**: more moving
  parts (socket path resolution, `-L`/`-S` flags) for no practical gain.
