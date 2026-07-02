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
