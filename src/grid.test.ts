import { describe, expect, test } from 'bun:test';
import { calculateGrid, MIN_CARD_WIDTH } from './grid.ts';

describe('calculateGrid', () => {
  test('fits default cards to available screen space (8 sessions on 100x30)', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 100, height: 30 }, 8);
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.cards.length).toBe(8);
    expect(grid.cards[0]!.width).toBe(24);
    expect(grid.cards[0]!.height).toBe(14);
    expect(grid.cards[3]!.x + grid.cards[3]!.width).toBe(100);
  });

  test('keeps wide screens balanced by default (9 sessions on 240x60)', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 240, height: 60 }, 9);
    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(3);
    expect(grid.cards[0]!.width > grid.cards[0]!.height).toBe(true);
  });

  test('prefers complete rows when space is available (6 sessions on 240x60)', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 240, height: 60 }, 6);
    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(2);
    expect(grid.cards.length).toBe(6);
    expect(grid.cards[5]!.x + grid.cards[5]!.width).toBe(240);
  });

  test('prefers fewer empty slots when rows cannot be complete', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 240, height: 60 }, 7);
    expect(grid.columns).toBe(4);
    expect(grid.rows).toBe(2);
    expect(grid.cards.length).toBe(7);
  });

  test('thumbnail width uses as many min-width columns as fit', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 100, height: 30 }, 6, MIN_CARD_WIDTH);
    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(2);
    expect(grid.cards.length).toBe(6);
    expect(grid.cards[0]!.width >= MIN_CARD_WIDTH).toBe(true);
  });

  test('always has one column for narrow terminals', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 20, height: 30 }, 2);
    expect(grid.columns).toBe(1);
    expect(grid.rows).toBe(2);
    expect(grid.cards.length).toBe(2);
  });

  test('custom min card width makes automatic cards larger', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 100, height: 30 }, 6, 50);
    expect(grid.columns).toBe(1);
    expect(grid.cards[0]!.width).toBe(100);
  });

  test('forced columns override automatic width calculation', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 100, height: 30 }, 6, 50, 3);
    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(2);
  });

  test('returns empty cards array when item count is zero', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 80, height: 24 }, 0);
    expect(grid.rows).toBe(0);
    expect(grid.cards.length).toBe(0);
  });

  test('handles a single item filling the whole area', () => {
    const grid = calculateGrid({ x: 0, y: 0, width: 80, height: 24 }, 1);
    expect(grid.columns).toBe(1);
    expect(grid.rows).toBe(1);
    expect(grid.cards.length).toBe(1);
    expect(grid.cards[0]!.width).toBe(80);
    expect(grid.cards[0]!.height).toBe(24);
  });
});
