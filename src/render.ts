import { truncateAnsi, visibleLength } from './ansi.ts';
import { C } from './colors.ts';
import { CARD_GAP, FOOTER_HEIGHT, calculateGrid } from './grid.ts';
import { App } from './model.ts';
import { moveCursor } from './terminal.ts';
import type { Rect, Session, TerminalSize, ViewMode } from './types.ts';

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

const LIST_PREVIEW_MIN_WIDTH = 80;
const LIST_PANEL_RATIO = 0.35;

/**
 * Render the full screen as a single string. Caller is responsible for writing
 * the result to stdout in one shot to avoid flicker.
 */
export function render(app: App, termSize: TerminalSize): string {
  const cols = termSize.cols;
  const rows = termSize.rows;
  const out: string[] = [];

  out.push('\x1b[2J\x1b[H');

  const contentArea: Rect = {
    x: 0,
    y: 0,
    width: cols,
    height: Math.max(0, rows - FOOTER_HEIGHT),
  };

  if (cols < 20 || rows < 6) {
    out.push(renderCenteredMessage(contentArea, 'Terminal too small'));
    out.push(moveCursor(rows, 1));
    out.push(renderFooter(app.searchText(), cols, app.viewMode));
    return out.join('');
  }

  if (app.error) {
    out.push(renderCenteredMessage(contentArea, app.error));
  } else if (app.sessions.length === 0 && !app.isCreateMode()) {
    out.push(renderCenteredMessage(contentArea, 'No tmux sessions found.\nType a name to create one.'));
  } else if (app.isCreateMode()) {
    if (app.viewMode === 'list') {
      out.push(renderListView(app, contentArea));
    } else {
      const createName = app.pendingCreateName() ?? '';
      const grid = calculateGrid(contentArea, 1);
      const rect = grid.cards[0];
      if (rect) {
        out.push(renderCreateCard(createName, rect));
      }
    }
  } else if (app.visibleSessionCount() === 0) {
    out.push(renderCenteredMessage(contentArea, 'No matching sessions'));
  } else if (app.viewMode === 'list') {
    out.push(renderListView(app, contentArea));
  } else {
    const visible = app.visibleSessions();
    const grid = calculateGrid(contentArea, visible.length);
    for (let i = 0; i < grid.cards.length; i += 1) {
      const rect = grid.cards[i]!;
      const session = visible[i];
      if (!session) continue;
      const isCurrent = app.currentSessionName === session.name;
      out.push(renderCard(session, rect, i === app.selectedIndex, isCurrent));
    }
  }

  out.push(moveCursor(rows, 1));
  out.push(renderFooter(app.searchText(), cols, app.viewMode, app.sessions.length > 0));
  return out.join('');
}

export function renderListView(app: App, area: Rect): string {
  const out: string[] = [];
  const visible = app.visibleSessions();
  const selected = app.selectedSession();
  const isCreate = app.isCreateMode();

  const showPreview = area.width >= LIST_PREVIEW_MIN_WIDTH;
  const listWidth = showPreview ? Math.max(20, Math.floor(area.width * LIST_PANEL_RATIO)) : area.width;
  const previewWidth = showPreview ? area.width - listWidth - 1 : 0;

  const scrollOffset = calculateScrollOffset(app.selectedIndex, area.height, visible.length + (isCreate ? 1 : 0));

  for (let row = 0; row < area.height; row += 1) {
    const itemIndex = row + scrollOffset;
    out.push(moveCursor(area.y + row + 1, area.x + 1));

    if (isCreate && itemIndex === 0) {
      const createName = app.pendingCreateName() ?? '';
      const isSelected = true;
      const prefix = isSelected ? `${C.cyanBold}▸ ` : '  ';
      const label = `Create: ${createName}`;
      const line = `${prefix}${C.cyanBold}${truncate(label, listWidth - 3)}${C.reset}`;
      out.push(line);
      const lineLen = visibleLength(line);
      if (lineLen < listWidth) out.push(' '.repeat(listWidth - lineLen));
    } else if (itemIndex < visible.length + (isCreate ? 1 : 0)) {
      const sessionIdx = isCreate ? itemIndex - 1 : itemIndex;
      const session = visible[sessionIdx];
      if (session) {
        const isItemSelected = sessionIdx === app.selectedIndex && !isCreate;
        const isCurrent = app.currentSessionName === session.name;
        out.push(renderListRow(session, listWidth, isItemSelected, isCurrent));
      }
    } else {
      out.push(' '.repeat(listWidth));
    }

    if (showPreview) {
      out.push(`${C.gray}│${C.reset}`);
      const previewSession = isCreate ? null : selected;
      if (previewSession && row === 0) {
        const title = ` ${previewSession.name} · ${previewSession.currentWindow ?? 'unknown'} · ${previewSession.windowCount} windows`;
        out.push(`${C.cyan}${truncate(title, previewWidth)}${C.reset}`);
        const titleLen = visibleLength(title);
        if (titleLen < previewWidth) out.push(' '.repeat(previewWidth - titleLen));
      } else if (previewSession && row === 1) {
        out.push(`${C.gray}${('─').repeat(previewWidth)}${C.reset}`);
      } else if (previewSession && row >= 2) {
        const previewLine = row - 2;
        if (previewSession.previewError !== null) {
          if (previewLine === 0) {
            const msg = ` Preview unavailable`;
            out.push(`${C.red}${truncate(msg, previewWidth)}${C.reset}`);
            const msgLen = visibleLength(msg);
            if (msgLen < previewWidth) out.push(' '.repeat(previewWidth - msgLen));
          } else {
            out.push(' '.repeat(previewWidth));
          }
        } else if (previewSession.preview.length === 0) {
          if (previewLine === 0) {
            const msg = ` No visible content`;
            out.push(`${C.gray}${truncate(msg, previewWidth)}${C.reset}`);
            const msgLen = visibleLength(msg);
            if (msgLen < previewWidth) out.push(' '.repeat(previewWidth - msgLen));
          } else {
            out.push(' '.repeat(previewWidth));
          }
        } else {
          const maxPreviewLines = area.height - 2;
          const start = Math.max(0, previewSession.preview.length - maxPreviewLines);
          const pLine = previewSession.preview[start + previewLine];
          if (pLine !== undefined) {
            const rendered = ` ${truncateAnsi(pLine, previewWidth - 1)}${C.reset}`;
            out.push(rendered);
            const renderedLen = visibleLength(rendered);
            if (renderedLen < previewWidth) out.push(' '.repeat(previewWidth - renderedLen));
          } else {
            out.push(' '.repeat(previewWidth));
          }
        }
      } else {
        out.push(' '.repeat(previewWidth));
      }
    }
  }

  return out.join('');
}

function renderListRow(session: Session, width: number, selected: boolean, isCurrent: boolean): string {
  const prefix = selected ? `${C.yellowBold}▸ ` : '  ';
  const nameColor = selected ? C.yellowBold : isCurrent ? C.greenBold : C.whiteBold;
  const statusColor = session.attached ? C.greenBold : C.gray;
  const status = session.attached ? 'attached' : 'detached';
  const meta = ` ${C.gray}${session.windowCount}w${C.reset} ${statusColor}${status}${C.reset}`;
  const metaVisible = ` ${session.windowCount}w ${status}`.length;

  const nameSpace = Math.max(1, width - 2 - metaVisible - 1);
  const name = truncate(session.name, nameSpace);
  const pad = Math.max(0, nameSpace - visibleLength(name));

  const line = `${prefix}${nameColor}${name}${C.reset}${' '.repeat(pad)}${meta}`;
  return line;
}

function calculateScrollOffset(selectedIndex: number, viewHeight: number, totalItems: number): number {
  if (totalItems <= viewHeight) return 0;
  const half = Math.floor(viewHeight / 2);
  if (selectedIndex <= half) return 0;
  if (selectedIndex >= totalItems - half) return Math.max(0, totalItems - viewHeight);
  return selectedIndex - half;
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

export function renderFooter(
  searchText: string | null,
  cols: number,
  viewMode: ViewMode = 'grid',
  hasSessions: boolean = true,
): string {
  const parts: string[] = [];
  const modeLabel = viewMode === 'grid' ? 'list' : 'grid';
  if (searchText !== null) {
    parts.push(`${C.cyan}Search: ${searchText}${C.reset}`);
    parts.push(`${C.gray} · ${C.reset}`);
    parts.push(`${C.yellowBold}↑↓←→/C-hjkl${C.reset}${C.gray} move · ${C.reset}`);
    parts.push(`${C.yellowBold}Enter${C.reset}${C.gray} switch/create · ${C.reset}`);
    parts.push(`${C.yellowBold}Ctrl-D${C.reset}${C.gray} kill · ${C.reset}`);
    parts.push(`${C.yellowBold}Tab${C.reset}${C.gray} ${modeLabel} · ${C.reset}`);
    parts.push(`${C.yellowBold}Esc${C.reset}${C.gray} clear${C.reset}`);
  } else if (!hasSessions) {
    parts.push(`${C.gray}type a name to create · ${C.reset}`);
    parts.push(`${C.yellowBold}Esc/Ctrl-C${C.reset}${C.gray} quit${C.reset}`);
  } else {
    parts.push(`${C.gray}type to filter · ${C.reset}`);
    parts.push(`${C.yellowBold}↑↓←→/C-hjkl${C.reset}${C.gray} move · ${C.reset}`);
    parts.push(`${C.yellowBold}Enter${C.reset}${C.gray} switch · ${C.reset}`);
    parts.push(`${C.yellowBold}Ctrl-D${C.reset}${C.gray} kill · ${C.reset}`);
    parts.push(`${C.yellowBold}Tab${C.reset}${C.gray} ${modeLabel} · ${C.reset}`);
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
