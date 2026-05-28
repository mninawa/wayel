import { beforeEach, describe, expect, it } from 'vitest';
import {
  readSidebarNavExpanded,
  writeSidebarNavExpanded,
} from './sidebar-nav-preference';

describe('sidebar-nav-preference', () => {
  beforeEach(() => {
    localStorage.clear();
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
