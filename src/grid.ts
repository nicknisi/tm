import type { GridLayout, Rect } from './types.ts';

export const MIN_CARD_WIDTH = 32;
export const MIN_CARD_HEIGHT = 10;
export const CARD_GAP = 2;
export const FOOTER_HEIGHT = 1;

/**
 * Calculate the grid layout that best fits `itemCount` cards into `area`.
 * Ported from tmux.expose's `calculate_grid` in ui.rs.
 */
export function calculateGrid(
  area: Rect,
  itemCount: number,
  minCardWidth?: number,
  forcedColumns?: number,
): GridLayout {
  if (itemCount === 0 || area.width === 0 || area.height === 0) {
    return { columns: 1, rows: 0, cards: [] };
  }

  const autoColumns = forcedColumns ?? calculateAutomaticColumns(area, itemCount, minCardWidth);
  const columns = Math.max(1, Math.min(itemCount, autoColumns));
  const rows = Math.ceil(itemCount / columns);

  const totalGapWidth = CARD_GAP * Math.max(0, columns - 1);
  const usableWidth = Math.max(columns, area.width - totalGapWidth);
  const baseCardWidth = Math.floor(usableWidth / columns);
  const extraWidth = usableWidth % columns;

  const totalGapHeight = CARD_GAP * Math.max(0, rows - 1);
  const usableHeight = Math.max(rows, area.height - totalGapHeight);
  const baseCardHeight = Math.floor(usableHeight / rows);
  const extraHeight = usableHeight % rows;

  const cards: Rect[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cardWidth = baseCardWidth + (col < extraWidth ? 1 : 0);
    const cardHeight = baseCardHeight + (row < extraHeight ? 1 : 0);

    let xOffset = 0;
    for (let previousCol = 0; previousCol < col; previousCol += 1) {
      xOffset += baseCardWidth + (previousCol < extraWidth ? 1 : 0);
    }
    xOffset += CARD_GAP * col;

    let yOffset = 0;
    for (let previousRow = 0; previousRow < row; previousRow += 1) {
      yOffset += baseCardHeight + (previousRow < extraHeight ? 1 : 0);
    }
    yOffset += CARD_GAP * row;

    cards.push({
      x: area.x + xOffset,
      y: area.y + yOffset,
      width: cardWidth,
      height: cardHeight,
    });
  }

  return { columns, rows, cards };
}

function calculateAutomaticColumns(area: Rect, itemCount: number, minCardWidth?: number): number {
  if (minCardWidth !== undefined) {
    const denom = Math.max(1, minCardWidth) + CARD_GAP;
    return Math.max(1, Math.floor((area.width + CARD_GAP) / denom));
  }

  let bestColumns = 1;
  let bestScore: [number, number, number, number] | null = null;

  for (let columns = 1; columns <= itemCount; columns += 1) {
    const rows = Math.ceil(itemCount / columns);
    const emptySlots = columns * rows - itemCount;
    const singleAxisPenalty = itemCount > 2 && (columns === 1 || rows === 1) ? 1 : 0;

    const gapW = CARD_GAP * Math.max(0, columns - 1);
    const cardWidth = columns > 0 ? Math.max(0, Math.floor(Math.max(0, area.width - gapW) / columns)) : area.width;
    const gapH = CARD_GAP * Math.max(0, rows - 1);
    const cardHeight = rows > 0 ? Math.max(0, Math.floor(Math.max(0, area.height - gapH) / rows)) : area.height;

    // 16:10-ish aspect target — same as tmux.expose (width*10 vs height*16).
    const aspectPenalty = Math.abs(cardWidth * 10 - cardHeight * 16);
    const cardArea = cardWidth * cardHeight;

    // Higher area is better, so we negate it for min comparison.
    const score: [number, number, number, number] = [singleAxisPenalty, emptySlots, aspectPenalty, -cardArea];

    if (bestScore === null || compareScores(score, bestScore) < 0) {
      bestScore = score;
      bestColumns = columns;
    }
  }

  return bestColumns;
}

function compareScores(a: [number, number, number, number], b: [number, number, number, number]): number {
  for (let i = 0; i < 4; i += 1) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}
