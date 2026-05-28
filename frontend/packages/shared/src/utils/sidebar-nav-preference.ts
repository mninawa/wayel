export type SidebarNavApp = 'ops' | 'customer';

const KEY = (app: SidebarNavApp) => `weyell.${app}.sidebar.expanded`;

/** Desktop sidebar starts expanded so labels are visible until the user collapses it. */
export function readSidebarNavExpanded(app: SidebarNavApp, defaultExpanded = true): boolean {
  if (typeof localStorage === 'undefined') {
    return defaultExpanded;
  }

  const stored = localStorage.getItem(KEY(app));
  if (stored === null) {
    return defaultExpanded;
  }

  return stored === '1';
}

export function writeSidebarNavExpanded(app: SidebarNavApp, expanded: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(KEY(app), expanded ? '1' : '0');
}
