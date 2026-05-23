import { truncateAnsi, visibleLength } from './ansi.ts';
import { C } from './colors.ts';
import { CARD_GAP, FOOTER_HEIGHT, calculateGrid } from './grid.ts';
import { App } from './model.ts';
import { moveCursor } from './terminal.ts';
import type { Rect, Session, TerminalSize } from './types.ts';

// Box-drawing chars.
const BOX_PLAIN = {
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  h: '─',
  v: '│',
};
const BOX_DOUBLE = {
  tl: '╔',
  tr: '╗',
  bl: '╚',
  br: '╝',
  h: '═',
  v: '║',
};

export interface RenderContext {
  app: App;
  termSize: TerminalSize;
}

/**
 * Render the full screen as a single string. Caller is responsible for writing
 * the result to stdout in one shot to avoid flicker.
 */
export function render(app: App, termSize: TerminalSize): string {
  const cols = termSize.cols;
  const rows = termSize.rows;
  const out: string[] = [];

  // Clear screen + home.
  out.push('\x1b[2J\x1b[H');

  const gridArea: Rect = {
    x: 0,
    y: 0,
    width: cols,
    height: Math.max(0, rows - FOOTER_HEIGHT),
  };

  if (cols < 20 || rows < 6) {
    out.push(renderCenteredMessage(gridArea, 'Terminal too small'));
    out.push(moveCursor(rows, 1));
    out.push(renderFooter(app.searchText(), cols));
    return out.join('');
  }

  if (app.error) {
    out.push(renderCenteredMessage(gridArea, app.error));
  } else if (app.sessions.length === 0 && !app.isCreateMode()) {
    out.push(renderCenteredMessage(gridArea, 'No tmux sessions found.\nPress Esc or Ctrl-C to quit.'));
  } else if (app.isCreateMode()) {
    const createName = app.pendingCreateName() ?? '';
    const grid = calculateGrid(gridArea, 1);
    const rect = grid.cards[0];
    if (rect) {
      out.push(renderCreateCard(createName, rect));
    }
  } else if (app.visibleSessionCount() === 0) {
    out.push(renderCenteredMessage(gridArea, 'No matching sessions'));
  } else {
    const visible = app.visibleSessions();
    const grid = calculateGrid(gridArea, visible.length);
    for (let i = 0; i < grid.cards.length; i += 1) {
      const rect = grid.cards[i]!;
      const session = visible[i];
      if (!session) continue;
      const isCurrent = app.currentSessionName === session.name;
      out.push(renderCard(session, rect, i === app.selectedIndex, isCurrent));
    }
  }

  out.push(moveCursor(rows, 1));
  out.push(renderFooter(app.searchText(), cols));
  return out.join('');
}

export function renderCard(session: Session, rect: Rect, selected: boolean, isCurrent: boolean): string {
  if (rect.width < 4 || rect.height < 3) return '';

  const out: string[] = [];
  const box = selected ? BOX_DOUBLE : BOX_PLAIN;
  const borderColor = selected ? C.yellowBold : isCurrent ? C.green : C.gray;
  const titleColor = selected ? C.yellowBold : isCurrent ? C.greenBold : C.whiteBold;

  const innerWidth = rect.width - 2;
  const titleSpace = Math.max(0, innerWidth - 2);
  const title = truncate(session.name, Math.max(0, titleSpace - 2));
  const titleSegment = `${box.h} ${titleColor}${title}${C.reset}${borderColor} `;
  const titleVisible = visibleLength(`${box.h} ${title} `);
  const remainingTop = Math.max(0, innerWidth - titleVisible);

  // Top border with title.
  out.push(moveCursor(rect.y + 1, rect.x + 1));
  out.push(borderColor);
  out.push(box.tl);
  out.push(titleSegment);
  out.push(box.h.repeat(remainingTop));
  out.push(box.tr);
  out.push(C.reset);

  // Side borders + interior content lines.
  const interiorLines = buildInteriorLines(session, innerWidth, rect.height - 2);
  for (let row = 0; row < rect.height - 2; row += 1) {
    out.push(moveCursor(rect.y + 2 + row, rect.x + 1));
    out.push(borderColor);
    out.push(box.v);
    out.push(C.reset);
    const line = interiorLines[row] ?? '';
    out.push(line);
    // Pad to fill the card width.
    const lineWidth = visibleLength(line);
    if (lineWidth < innerWidth) {
      out.push(' '.repeat(innerWidth - lineWidth));
    }
    out.push(borderColor);
    out.push(box.v);
    out.push(C.reset);
  }

  // Bottom border with status.
  out.push(moveCursor(rect.y + rect.height, rect.x + 1));
  out.push(borderColor);
  out.push(box.bl);
  const status = session.attached
    ? ` ${C.greenBold}attached${C.reset}${borderColor} `
    : ` ${C.gray}detached${C.reset}${borderColor} `;
  const statusVisible = session.attached ? ' attached '.length : ' detached '.length;
  out.push(box.h);
  out.push(status);
  const remainingBottom = Math.max(0, innerWidth - 1 - statusVisible);
  out.push(box.h.repeat(remainingBottom));
  out.push(box.br);
  out.push(C.reset);

  return out.join('');
}

export function renderCreateCard(name: string, rect: Rect): string {
  if (rect.width < 4 || rect.height < 3) return '';

  const out: string[] = [];
  const box = BOX_DOUBLE;
  const borderColor = C.cyanBold;
  const titleColor = C.cyanBold;

  const innerWidth = rect.width - 2;
  const titleSpace = Math.max(0, innerWidth - 2);
  const titleText = `Create: ${name}`;
  const title = truncate(titleText, Math.max(0, titleSpace - 2));
  const titleSegment = `${box.h} ${titleColor}${title}${C.reset}${borderColor} `;
  const titleVisible = visibleLength(`${box.h} ${title} `);
  const remainingTop = Math.max(0, innerWidth - titleVisible);

  out.push(moveCursor(rect.y + 1, rect.x + 1));
  out.push(borderColor);
  out.push(box.tl);
  out.push(titleSegment);
  out.push(box.h.repeat(remainingTop));
  out.push(box.tr);
  out.push(C.reset);

  const contentHeight = rect.height - 2;
  const message = ` Press Enter to create session "${name}"`;
  const messageLine = truncate(message, innerWidth);
  const lines: string[] = [];
  // Spacer
  lines.push('');
  lines.push(`${C.gray}${messageLine}${C.reset}`);
  while (lines.length < contentHeight) lines.push('');

  for (let row = 0; row < contentHeight; row += 1) {
    out.push(moveCursor(rect.y + 2 + row, rect.x + 1));
    out.push(borderColor);
    out.push(box.v);
    out.push(C.reset);
    const line = lines[row] ?? '';
    out.push(line);
    const lineWidth = visibleLength(line);
    if (lineWidth < innerWidth) {
      out.push(' '.repeat(innerWidth - lineWidth));
    }
    out.push(borderColor);
    out.push(box.v);
    out.push(C.reset);
  }

  out.push(moveCursor(rect.y + rect.height, rect.x + 1));
  out.push(borderColor);
  out.push(box.bl);
  out.push(box.h.repeat(innerWidth));
  out.push(box.br);
  out.push(C.reset);

  return out.join('');
}

function buildInteriorLines(session: Session, innerWidth: number, contentHeight: number): string[] {
  const lines: string[] = [];
  const previewWidthRaw = innerWidth - 2;
  const previewWidth = previewWidthRaw < 0 ? 0 : previewWidthRaw;

  // First line: window info.
  const windowName = session.currentWindow ?? 'unknown';
  const info = `${windowName} · ${session.windowCount} windows`;
  lines.push(` ${C.cyan}${truncate(info, previewWidth)}${C.reset}`);
  // Spacer line.
  lines.push('');

  const previewHeight = Math.max(0, contentHeight - lines.length);

  if (session.previewError !== null) {
    lines.push(` ${C.red}${truncate('Preview unavailable', previewWidth)}${C.reset}`);
  } else if (session.preview.length === 0) {
    lines.push(` ${C.gray}${truncate('No visible content', previewWidth)}${C.reset}`);
  } else {
    const start = Math.max(0, session.preview.length - previewHeight);
    for (let i = start; i < session.preview.length; i += 1) {
      const raw = session.preview[i]!;
      lines.push(` ${truncateAnsi(raw, previewWidth)}${C.reset}`);
    }
  }

  // Cap to contentHeight, padding short.
  while (lines.length < contentHeight) {
    lines.push('');
  }
  return lines.slice(0, contentHeight);
}

export function renderFooter(searchText: string | null, cols: number): string {
  const parts: string[] = [];
  if (searchText !== null) {
    parts.push(`${C.cyan}Search: ${searchText}${C.reset}`);
    parts.push(`${C.gray} · ${C.reset}`);
    parts.push(`${C.yellowBold}↑/↓/←/→${C.reset}${C.gray} move · ${C.reset}`);
    parts.push(`${C.yellowBold}Enter${C.reset}${C.gray} switch/create · ${C.reset}`);
    parts.push(`${C.yellowBold}Ctrl-D${C.reset}${C.gray} kill · ${C.reset}`);
    parts.push(`${C.yellowBold}Esc${C.reset}${C.gray} clear${C.reset}`);
  } else {
    parts.push(`${C.gray}type to filter · ${C.reset}`);
    parts.push(`${C.yellowBold}↑/↓/←/→${C.reset}${C.gray} move · ${C.reset}`);
    parts.push(`${C.yellowBold}Enter${C.reset}${C.gray} switch · ${C.reset}`);
    parts.push(`${C.yellowBold}Ctrl-D${C.reset}${C.gray} kill · ${C.reset}`);
    parts.push(`${C.yellowBold}Esc/Ctrl-C${C.reset}${C.gray} quit${C.reset}`);
  }
  const joined = parts.join('');
  return truncateAnsi(joined, cols);
}

function renderCenteredMessage(area: Rect, message: string): string {
  const lines = message.split('\n');
  const out: string[] = [];
  const startRow = area.y + Math.max(0, Math.floor((area.height - lines.length) / 2));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const truncated = truncate(line, area.width);
    const len = visibleLength(truncated);
    const startCol = area.x + Math.max(0, Math.floor((area.width - len) / 2));
    out.push(moveCursor(startRow + i + 1, startCol + 1));
    out.push(C.gray);
    out.push(truncated);
    out.push(C.reset);
  }
  return out.join('');
}

function truncate(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (value.length <= maxWidth) return value;
  return value.slice(0, maxWidth);
}

// CARD_GAP is exposed for clients that want to do their own measurements.
export { CARD_GAP };
