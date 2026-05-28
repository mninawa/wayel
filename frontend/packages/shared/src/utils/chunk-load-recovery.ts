const CHUNK_RELOAD_KEY = 'weyel.chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

const CHUNK_FAILURE_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk [\da-zA-Z_-]+ failed/i,
  /ChunkLoadError/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

/**
 * Detects Angular lazy-route / Vite chunk failures after a deploy when the
 * browser still holds an older main bundle that references removed hashes.
 */
export function isChunkLoadFailure(error: unknown): boolean {
  return collectErrorMessages(error).some((message) =>
    CHUNK_FAILURE_PATTERNS.some((pattern) => pattern.test(message)),
  );
}

/**
 * Hard-reloads the page once so the browser picks up the current index.html
 * and hashed chunks. Returns false when a reload was attempted recently
 * (prevents infinite reload loops).
 */
export function tryReloadAfterChunkLoadFailure(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const now = Date.now();
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0');
  if (last > 0 && now - last < RELOAD_COOLDOWN_MS) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
  return true;
}

/** Catches dynamic-import rejections that bypass Angular's ErrorHandler. */
export function registerChunkLoadRecovery(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadFailure(event.reason)) {
      return;
    }

    event.preventDefault();
    tryReloadAfterChunkLoadFailure();
  });
}

function collectErrorMessages(error: unknown, depth = 0): string[] {
  if (depth > 4 || error == null) {
    return [];
  }

  const messages: string[] = [];

  if (typeof error === 'string') {
    messages.push(error);
  } else if (error instanceof Error) {
    if (error.message.trim()) {
      messages.push(error.message);
    }
    if (error.cause) {
      messages.push(...collectErrorMessages(error.cause, depth + 1));
    }
  } else if (typeof error === 'object') {
    const record = error as { message?: unknown; rejection?: unknown; error?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) {
      messages.push(record.message);
    }
    if (record.rejection) {
      messages.push(...collectErrorMessages(record.rejection, depth + 1));
    }
    if (record.error) {
      messages.push(...collectErrorMessages(record.error, depth + 1));
    }
  }

  try {
    messages.push(String(error));
  } catch {
    // ignore
  }

  return messages;
}
