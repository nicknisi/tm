import { describe, expect, test } from 'bun:test';
import { fuzzyMatches } from './fuzzy.ts';

describe('fuzzyMatches', () => {
  test('empty query matches anything', () => {
    expect(fuzzyMatches('anything', '')).toBe(true);
    expect(fuzzyMatches('', '')).toBe(true);
  });

  test('matches simple subsequences', () => {
    expect(fuzzyMatches('backend-api', 'ba')).toBe(true);
    expect(fuzzyMatches('database', 'ba')).toBe(true);
    expect(fuzzyMatches('frontend', 'ba')).toBe(false);
  });

  test('returns false when subsequence not present', () => {
    expect(fuzzyMatches('frontend', 'xyz')).toBe(false);
    expect(fuzzyMatches('backend', 'kab')).toBe(false);
  });

  test('is case insensitive', () => {
    expect(fuzzyMatches('Backend', 'be')).toBe(true);
    expect(fuzzyMatches('backend', 'BE')).toBe(true);
    expect(fuzzyMatches('BACKEND', 'be')).toBe(true);
  });

  test('query longer than name returns false', () => {
    expect(fuzzyMatches('ab', 'abc')).toBe(false);
    expect(fuzzyMatches('', 'a')).toBe(false);
  });

  test('exact full match', () => {
    expect(fuzzyMatches('dev', 'dev')).toBe(true);
  });

  test('matches special characters', () => {
    expect(fuzzyMatches('docs/api', 'da')).toBe(true);
    expect(fuzzyMatches('foo-bar.baz', '.b')).toBe(true);
  });

  test('chars must appear in order', () => {
    // "ab" should not match "ba" because 'a' would need to come before 'b'
    expect(fuzzyMatches('ba', 'ab')).toBe(false);
  });

  test('repeated chars in query consume distinct positions', () => {
    // "aa" should not match "a" because we need two a's
    expect(fuzzyMatches('a', 'aa')).toBe(false);
    // "aa" matches "aXa"
    expect(fuzzyMatches('aXa', 'aa')).toBe(true);
  });
});
