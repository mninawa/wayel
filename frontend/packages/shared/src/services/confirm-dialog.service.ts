import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type ConfirmKind = 'default' | 'danger' | 'warning';

export interface ConfirmInputSpec {
  /** Label rendered above the input. */
  label: string;
  /** Initial value. */
  initial?: string;
  /** Placeholder shown in the input. */
  placeholder?: string;
  /** When true, an empty trimmed value is treated as a validation failure. */
  required?: boolean;
  /** When provided, must return null when valid or an error message string. */
  validate?: (raw: string) => string | null;
  /** "text" (single-line input) or "textarea" (multi-line). */
  kind?: 'text' | 'textarea';
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Primary CTA label (e.g. "Delete"). Defaults to "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the primary button. */
  kind?: ConfirmKind;
  /** Optional input that becomes part of the result. */
  input?: ConfirmInputSpec;
}

export interface ConfirmResult {
  confirmed: boolean;
  /** Trimmed value when an `input` was configured. */
  value?: string;
}

interface ActiveDialog extends ConfirmOptions {
  resolve: (r: ConfirmResult) => void;
}

/**
 * Promise/Observable based confirmation dialogs. Drop the
 * `<nk-confirm-host />` once at the app shell, then call
 * `confirm.ask({...})` anywhere. This replaces the blocking
 * `window.confirm` / `window.prompt` flows.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _active = signal<ActiveDialog | null>(null);
  readonly active = this._active.asReadonly();

  ask(options: ConfirmOptions): Observable<ConfirmResult> {
    const subject = new Subject<ConfirmResult>();
    this._active.set({
      ...options,
      resolve: (r) => {
        subject.next(r);
        subject.complete();
        this._active.set(null);
      },
    });
    return subject.asObservable();
  }

  resolve(result: ConfirmResult): void {
    const a = this._active();
    if (a) a.resolve(result);
  }
}
