import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionTimeoutService } from './session-timeout.service';

/**
 * The service touches `window` / `document` to attach activity
 * listeners. Vitest's default `node` environment doesn't ship them, so
 * we install minimal stubs per test. We don't rely on jsdom because
 * the surface is tiny and a stub keeps the tests fast and deterministic.
 */
type StubListenerEntry = { type: string; handler: EventListener };

function installDomStubs(): {
  windowListeners: StubListenerEntry[];
  documentListeners: StubListenerEntry[];
  fireWindow: (type: string) => void;
  fireDocument: (type: string) => void;
  uninstall: () => void;
} {
  const windowListeners: StubListenerEntry[] = [];
  const documentListeners: StubListenerEntry[] = [];

  const win = {
    addEventListener: (type: string, handler: EventListener) => {
      windowListeners.push({ type, handler });
    },
    removeEventListener: (type: string, handler: EventListener) => {
      const i = windowListeners.findIndex(
        (e) => e.type === type && e.handler === handler,
      );
      if (i >= 0) windowListeners.splice(i, 1);
    },
  };

  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, handler: EventListener) => {
      documentListeners.push({ type, handler });
    },
    removeEventListener: (type: string, handler: EventListener) => {
      const i = documentListeners.findIndex(
        (e) => e.type === type && e.handler === handler,
      );
      if (i >= 0) documentListeners.splice(i, 1);
    },
  };

  // @ts-expect-error – stubbing for tests
  globalThis.window = win;
  // @ts-expect-error – stubbing for tests
  globalThis.document = doc;

  return {
    windowListeners,
    documentListeners,
    fireWindow: (type) => {
      for (const e of [...windowListeners]) {
        if (e.type === type) e.handler(new Event(type));
      }
    },
    fireDocument: (type) => {
      for (const e of [...documentListeners]) {
        if (e.type === type) e.handler(new Event(type));
      }
    },
    uninstall: () => {
      // @ts-expect-error – cleanup
      delete globalThis.window;
      // @ts-expect-error – cleanup
      delete globalThis.document;
    },
  };
}

let stubs: ReturnType<typeof installDomStubs>;

beforeEach(() => {
  stubs = installDomStubs();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  stubs.uninstall();
});

describe('SessionTimeoutService', () => {
  it('starts in `idle` and transitions to `active` once started', () => {
    const svc = new SessionTimeoutService();
    expect(svc.state()).toBe('idle');

    svc.start({
      idleMs: 10_000,
      warningMs: 1_000,
      onExpired: () => {},
    });

    expect(svc.state()).toBe('active');
    svc.stop();
  });

  it('opens the warning at `idleMs - warningMs`', () => {
    const svc = new SessionTimeoutService();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired: () => {} });

    vi.advanceTimersByTime(8_999);
    expect(svc.state()).toBe('active');

    vi.advanceTimersByTime(1);
    expect(svc.state()).toBe('warning');
    // remainingMs is the warning window at the instant the dialog opens.
    expect(svc.remainingMs()).toBe(1_000);

    svc.stop();
  });

  it('counts down during the warning window then expires', () => {
    const svc = new SessionTimeoutService();
    const onExpired = vi.fn();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired });

    // Trip the warning.
    vi.advanceTimersByTime(9_000);
    expect(svc.state()).toBe('warning');

    // Halfway through the countdown the remaining time has dropped.
    vi.advanceTimersByTime(500);
    expect(svc.state()).toBe('warning');
    expect(svc.remainingMs()).toBeLessThan(1_000);

    // Run out the clock.
    vi.advanceTimersByTime(600);
    expect(svc.state()).toBe('expired');
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('extends the session back to `active` and resets the idle timer', () => {
    const svc = new SessionTimeoutService();
    const onExpired = vi.fn();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired });

    vi.advanceTimersByTime(9_000);
    expect(svc.state()).toBe('warning');

    svc.extend();
    expect(svc.state()).toBe('active');

    // After an extend, the warning shouldn't fire for another full
    // (idleMs - warningMs) cycle.
    vi.advanceTimersByTime(8_999);
    expect(svc.state()).toBe('active');
    vi.advanceTimersByTime(1);
    expect(svc.state()).toBe('warning');

    expect(onExpired).not.toHaveBeenCalled();
    svc.stop();
  });

  it('ignores activity events while in the `warning` state (no auto-extend)', () => {
    const svc = new SessionTimeoutService();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired: () => {} });

    vi.advanceTimersByTime(9_000);
    expect(svc.state()).toBe('warning');

    // Simulate a stray screensaver mouse movement: should NOT bump the
    // user back to `active` — that would defeat the warning's purpose.
    stubs.fireWindow('mousemove');
    expect(svc.state()).toBe('warning');

    svc.stop();
  });

  it('resets the idle timer on activity while `active`', () => {
    const svc = new SessionTimeoutService();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired: () => {} });

    // 5 s of waiting…
    vi.advanceTimersByTime(5_000);
    // …then activity. The schedule should restart from now.
    stubs.fireWindow('keydown');

    // Without the reset we'd hit the warning at +4s. With it we shouldn't.
    vi.advanceTimersByTime(8_999);
    expect(svc.state()).toBe('active');
    vi.advanceTimersByTime(1);
    expect(svc.state()).toBe('warning');

    svc.stop();
  });

  it('stop() detaches listeners and reverts to `idle`', () => {
    const svc = new SessionTimeoutService();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired: () => {} });
    expect(stubs.windowListeners.length).toBeGreaterThan(0);

    svc.stop();
    expect(svc.state()).toBe('idle');
    expect(stubs.windowListeners.length).toBe(0);
  });

  it('expireNow() short-circuits the countdown and invokes onExpired exactly once', () => {
    const svc = new SessionTimeoutService();
    const onExpired = vi.fn();
    svc.start({ idleMs: 10_000, warningMs: 1_000, onExpired });

    svc.expireNow();
    expect(svc.state()).toBe('expired');
    expect(onExpired).toHaveBeenCalledTimes(1);

    // A second call must not double-fire onExpired (defends consumers
    // that wire navigation in there).
    svc.expireNow();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
