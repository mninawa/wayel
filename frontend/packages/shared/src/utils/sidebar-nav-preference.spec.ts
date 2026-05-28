import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readSidebarNavExpanded,
  writeSidebarNavExpanded,
} from './sidebar-nav-preference';

function stubLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

describe('sidebar-nav-preference', () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to expanded when unset', () => {
    expect(readSidebarNavExpanded('ops')).toBe(true);
    expect(readSidebarNavExpanded('customer')).toBe(true);
  });

  it('persists collapsed and expanded choices per app', () => {
    writeSidebarNavExpanded('ops', false);
    writeSidebarNavExpanded('customer', true);

    expect(readSidebarNavExpanded('ops')).toBe(false);
    expect(readSidebarNavExpanded('customer')).toBe(true);
  });
});
