import { fuzzyMatches } from './fuzzy.ts';
import type { Session, ViewMode } from './types.ts';

export { fuzzyMatches };

export class App {
  sessions: Session[];
  selectedIndex: number;
  currentSessionName: string | null;
  shouldQuit: boolean;
  shouldSwitch: boolean;
  shouldCreate: boolean;
  shouldDelete: boolean;
  error: string | null;
  viewMode: ViewMode;
  private searchQuery: string | null;

  constructor(sessions: Session[], currentSessionName: string | null) {
    this.sessions = sessions;
    this.currentSessionName = currentSessionName;
    this.shouldQuit = false;
    this.shouldSwitch = false;
    this.shouldCreate = false;
    this.shouldDelete = false;
    this.error = null;
    this.viewMode = 'grid';
    this.searchQuery = null;

    if (currentSessionName) {
      const idx = sessions.findIndex((s) => s.name === currentSessionName);
      this.selectedIndex = idx >= 0 ? idx : 0;
    } else {
      this.selectedIndex = 0;
    }
  }

  visibleSessions(): Session[] {
    if (this.searchQuery === null) {
      return this.sessions.slice();
    }
    const query = this.searchQuery;
    return this.sessions.filter((s) => fuzzyMatches(s.name, query));
  }

  visibleSessionCount(): number {
    return this.visibleSessions().length;
  }

  selectedSession(): Session | null {
    const visible = this.visibleSessions();
    return visible[this.selectedIndex] ?? null;
  }

  startSearch(): void {
    this.searchQuery = '';
    this.selectedIndex = 0;
  }

  pushSearchChar(ch: string): void {
    if (this.searchQuery !== null) {
      this.searchQuery += ch;
      this.selectedIndex = 0;
    }
  }

  popSearchChar(): void {
    if (this.searchQuery !== null) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.selectedIndex = 0;
    }
  }

  clearSearch(): void {
    this.searchQuery = null;
    this.selectedIndex = 0;
  }

  isSearching(): boolean {
    return this.searchQuery !== null;
  }

  searchText(): string | null {
    return this.searchQuery;
  }

  /**
   * True when the user has typed a non-empty search query that matches no
   * session — in that case the UI shows a "Create: {query}" card and Enter
   * should create the session rather than switch.
   */
  isCreateMode(): boolean {
    return this.searchQuery !== null && this.searchQuery.length > 0 && this.visibleSessionCount() === 0;
  }

  pendingCreateName(): string | null {
    if (!this.isCreateMode()) return null;
    return this.searchQuery;
  }

  replaceSessions(sessions: Session[]): void {
    const selectedName = this.selectedSession()?.name ?? null;
    this.sessions = sessions;

    const visibleCount = this.visibleSessionCount();
    if (visibleCount === 0) {
      this.selectedIndex = 0;
      return;
    }

    if (selectedName !== null) {
      const newIdx = this.visibleSessions().findIndex((s) => s.name === selectedName);
      if (newIdx >= 0) {
        this.selectedIndex = newIdx;
        return;
      }
    }
    this.selectedIndex = Math.min(this.selectedIndex, visibleCount - 1);
  }

  moveLeft(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex -= 1;
    }
  }

  moveRight(): void {
    if (this.selectedIndex + 1 < this.visibleSessionCount()) {
      this.selectedIndex += 1;
    }
  }

  moveUp(columns: number): void {
    const cols = Math.max(1, columns);
    if (this.selectedIndex >= cols) {
      this.selectedIndex -= cols;
    }
  }

  moveDown(columns: number): void {
    const cols = Math.max(1, columns);
    const visibleCount = this.visibleSessionCount();
    if (visibleCount === 0) return;

    const lastIndex = visibleCount - 1;
    const currentRow = Math.floor(this.selectedIndex / cols);
    const lastRow = Math.floor(lastIndex / cols);
    if (currentRow < lastRow) {
      this.selectedIndex = Math.min(this.selectedIndex + cols, lastIndex);
    }
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }
}
