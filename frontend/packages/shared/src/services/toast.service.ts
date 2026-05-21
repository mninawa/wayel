import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  variant: ToastVariant;
  title?: string;
  message: string;
  /** Auto-dismiss after this many ms. `0` = sticky (must be dismissed). */
  durationMs: number;
  /** Optional inline action. */
  action?: { label: string; run: () => void };
}

interface ShowOptions {
  title?: string;
  durationMs?: number;
  action?: ToastMessage['action'];
}

const DEFAULTS: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 7000,
};

/**
 * Tiny app-wide toast queue. Components mount `<nk-toast-host />` once at the
 * shell level; everything else just calls `toast.success(...)` etc.
 *
 * Designed to replace ad-hoc `window.alert` calls — non-blocking, accessible
 * (the host is `aria-live="polite"`), and stylable per-app via `--nk-*`
 * variables.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _items = signal<ToastMessage[]>([]);
  readonly items = this._items.asReadonly();

  success(message: string, opts?: ShowOptions): number {
    return this.show('success', message, opts);
  }

  error(message: string, opts?: ShowOptions): number {
    return this.show('error', message, opts);
  }

  info(message: string, opts?: ShowOptions): number {
    return this.show('info', message, opts);
  }

  warning(message: string, opts?: ShowOptions): number {
    return this.show('warning', message, opts);
  }

  show(variant: ToastVariant, message: string, opts: ShowOptions = {}): number {
    const id = this.nextId++;
    const durationMs = opts.durationMs ?? DEFAULTS[variant];
    const item: ToastMessage = {
      id,
      variant,
      title: opts.title,
      message,
      durationMs,
      action: opts.action,
    };
    this._items.update((arr) => [...arr, item]);
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => this.dismiss(id), durationMs);
    }
    return id;
  }

  dismiss(id: number): void {
    this._items.update((arr) => arr.filter((t) => t.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }
}
