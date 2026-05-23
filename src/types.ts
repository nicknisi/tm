export interface Session {
  id: string;
  name: string;
  attached: boolean;
  windowCount: number;
  currentWindow: string | null;
  lastActivity: string | null;
  preview: string[];
  previewError: string | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridLayout {
  columns: number;
  rows: number;
  cards: Rect[];
}

export interface TerminalSize {
  rows: number;
  cols: number;
}

export type KeyEvent =
  | { type: 'char'; char: string }
  | { type: 'enter' }
  | { type: 'escape' }
  | { type: 'backspace' }
  | { type: 'arrow'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'ctrl'; char: string }
  | { type: 'unknown' };

export type MouseButton = 'left' | 'right' | 'middle' | 'scroll-up' | 'scroll-down' | 'other';

export interface MouseEvent {
  button: MouseButton;
  x: number;
  y: number;
  type: 'press' | 'release' | 'move';
}
