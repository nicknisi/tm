import { describe, expect, test } from 'bun:test';
import { stripAnsi, truncateAnsi, visibleLength } from './ansi.ts';

describe('stripAnsi', () => {
  test('removes SGR sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m plain')).toBe('red plain');
  });

  test('removes 256-color and truecolor sequences', () => {
    expect(stripAnsi('\x1b[38;5;196mred256\x1b[0m')).toBe('red256');
    expect(stripAnsi('\x1b[38;2;255;0;0mtruecolor\x1b[0m')).toBe('truecolor');
  });

  test('leaves plain text untouched', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  test('handles empty input', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('visibleLength', () => {
  test('counts only visible characters', () => {
    expect(visibleLength('\x1b[31mred\x1b[0m plain')).toBe(9);
  });

  test('returns 0 for ANSI-only string', () => {
    expect(visibleLength('\x1b[31m\x1b[0m')).toBe(0);
  });
});

describe('truncateAnsi', () => {
  test('preserves SGR sequences and counts only visible chars', () => {
    expect(truncateAnsi('\x1b[31mred\x1b[0m plain', 5)).toBe('\x1b[31mred\x1b[0m p');
  });

  test('returns empty string for maxWidth=0', () => {
    expect(truncateAnsi('hello', 0)).toBe('');
  });

  test('returns full string when shorter than maxWidth', () => {
    expect(truncateAnsi('hi', 10)).toBe('hi');
  });

  test('handles 256-color sequences', () => {
    expect(truncateAnsi('\x1b[38;5;196mabcdef', 3)).toBe('\x1b[38;5;196mabc');
  });

  test('handles truecolor sequences', () => {
    expect(truncateAnsi('\x1b[38;2;255;0;0mabcdef', 3)).toBe('\x1b[38;2;255;0;0mabc');
  });

  test('handles nested styles', () => {
    const input = '\x1b[1m\x1b[31mbold-red\x1b[0m tail';
    expect(truncateAnsi(input, 4)).toBe('\x1b[1m\x1b[31mbold');
  });

  test('handles empty string', () => {
    expect(truncateAnsi('', 10)).toBe('');
  });
});
