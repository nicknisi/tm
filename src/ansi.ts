// oxlint-disable-next-line no-control-regex
const ANSI_PATTERN = /\[[0-9;:]*[@-~]/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

/**
 * Truncate a string to `maxWidth` visible characters, preserving any ANSI
 * escape sequences encountered along the way. Sequences past the visible
 * cutoff are dropped. Ported from tmux.expose's `truncate_ansi` in ui.rs.
 */
export function truncateAnsi(value: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }

  let output = '';
  let visible = 0;
  let i = 0;
  while (i < value.length) {
    const ch = value[i]!;
    if (ch === '\x1b' && value[i + 1] === '[') {
      output += ch;
      output += value[i + 1]!;
      i += 2;
      while (i < value.length) {
        const next = value[i]!;
        output += next;
        i += 1;
        const code = next.charCodeAt(0);
        // Final byte of CSI is in range @ (0x40) through ~ (0x7e).
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
      }
      continue;
    }

    if (visible === maxWidth) {
      break;
    }

    output += ch;
    visible += 1;
    i += 1;
  }

  return output;
}
