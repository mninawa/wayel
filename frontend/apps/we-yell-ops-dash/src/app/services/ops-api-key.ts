/** Session storage keys for warehouse ops session. */
export const OPS_KEY_STORAGE = 'weyell.ops.apiKey';
export const OPS_ACTOR_STORAGE = 'weyell.ops.actor';

export function getStoredOpsKey(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(OPS_KEY_STORAGE);
}

export function getStoredOpsActor(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(OPS_ACTOR_STORAGE);
}

export function storeOpsKey(key: string): void {
  sessionStorage.setItem(OPS_KEY_STORAGE, key.trim());
}

export function storeOpsActor(actor: string): void {
  sessionStorage.setItem(OPS_ACTOR_STORAGE, actor.trim());
}

export function clearStoredOpsKey(): void {
  sessionStorage.removeItem(OPS_KEY_STORAGE);
  sessionStorage.removeItem(OPS_ACTOR_STORAGE);
}
