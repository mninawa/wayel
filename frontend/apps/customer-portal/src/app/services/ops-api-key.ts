/** Shared sessionStorage key for internal ops tools (KYC, parcel receive). */
export const OPS_KEY_STORAGE = 'weyell.ops.apiKey';

const LEGACY_OPS_KEY_STORAGE = 'weyell.kyc.opsKey';

export function getStoredOpsKey(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return (
    sessionStorage.getItem(OPS_KEY_STORAGE) ??
    sessionStorage.getItem(LEGACY_OPS_KEY_STORAGE)
  );
}

export function storeOpsKey(key: string): void {
  sessionStorage.setItem(OPS_KEY_STORAGE, key.trim());
}

export function clearStoredOpsKey(): void {
  sessionStorage.removeItem(OPS_KEY_STORAGE);
  sessionStorage.removeItem(LEGACY_OPS_KEY_STORAGE);
}
