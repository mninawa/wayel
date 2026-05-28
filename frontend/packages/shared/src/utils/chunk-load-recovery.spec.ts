import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isChunkLoadFailure,
  tryReloadAfterChunkLoadFailure,
} from './chunk-load-recovery';

describe('chunk-load-recovery', () => {
  it('detects dynamically imported module fetch failures', () => {
    expect(
      isChunkLoadFailure(
        new TypeError(
          'Failed to fetch dynamically imported module: https://example.com/chunk-VJ4ANF5B.js',
        ),
      ),
    ).toBe(true);
  });

  it('detects nested zone.js rejection wrappers', () => {
    expect(
      isChunkLoadFailure({
        message: 'Uncaught (in promise)',
        rejection: new Error('Loading chunk 42 failed.'),
      }),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadFailure(new Error('Network request failed'))).toBe(false);
  });

  describe('tryReloadAfterChunkLoadFailure', () => {
    const reload = vi.fn();

    beforeEach(() => {
      sessionStorage.clear();
      reload.mockReset();
      vi.stubGlobal('window', { location: { reload } } as Window & typeof globalThis);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('reloads at most once per cooldown window', () => {
      expect(tryReloadAfterChunkLoadFailure()).toBe(true);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(tryReloadAfterChunkLoadFailure()).toBe(false);
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});
