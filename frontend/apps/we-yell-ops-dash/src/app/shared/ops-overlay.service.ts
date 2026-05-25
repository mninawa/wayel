import { Injectable, signal } from '@angular/core';
import type { OpsPromptOptions, OpsPromptState, OpsToast, OpsToastTone } from './ops-overlay.types';

@Injectable({ providedIn: 'root' })
export class OpsOverlayService {
  readonly prompt = signal<OpsPromptState | null>(null);
  readonly toasts = signal<OpsToast[]>([]);

  openPrompt(options: OpsPromptOptions): Promise<Record<string, string> | null> {
    return new Promise((resolve) => {
      const values: Record<string, string> = {};
      for (const field of options.fields) {
        values[field.id] = field.defaultValue ?? '';
      }
      this.prompt.set({
        variant: options.variant ?? 'dialog',
        confirmLabel: options.confirmLabel ?? 'Save',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        fieldError: null,
        values,
        resolve,
        ...options,
      });
    });
  }

  promptNote(options: {
    title: string;
    message?: string;
    hint?: string;
    fieldLabel?: string;
    placeholder?: string;
    defaultValue?: string;
    required?: boolean;
    confirmLabel?: string;
  }): Promise<string | null> {
    return this.openPrompt({
      title: options.title,
      message: options.message,
      hint: options.hint,
      variant: 'note',
      confirmLabel: options.confirmLabel ?? 'Send',
      fields: [
        {
          id: 'value',
          label: options.fieldLabel ?? 'Reason',
          placeholder: options.placeholder,
          defaultValue: options.defaultValue,
          required: options.required ?? false,
          multiline: true,
        },
      ],
    }).then((result) => {
      if (!result) return null;
      const value = result['value']?.trim() ?? '';
      if (options.required && !value) return null;
      return value;
    });
  }

  requestInvoiceRejectionReason(): Promise<string | null> {
    return this.promptNote({
      title: 'Reject invoice',
      message: 'Explain what the customer must upload or fix on their invoice.',
      hint: 'This reason is sent to the customer via WhatsApp.',
      fieldLabel: 'Rejection reason',
      placeholder: 'e.g. Declared value R 2000 does not match invoice total R 650',
      required: true,
      confirmLabel: 'Reject & notify',
    });
  }

  confirmDialog(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): Promise<boolean> {
    return this.openPrompt({
      title: options.title,
      message: options.message,
      variant: 'dialog',
      confirmLabel: options.confirmLabel ?? 'Confirm',
      cancelLabel: options.cancelLabel ?? 'Cancel',
      fields: [],
    }).then((result) => result !== null);
  }

  showToast(message: string, tone: OpsToastTone = 'info', durationMs = 4200): void {
    const id = crypto.randomUUID();
    this.toasts.update((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => this.dismissToast(id), durationMs);
  }

  success(message: string): void {
    this.showToast(message, 'success');
  }

  error(message: string): void {
    this.showToast(message, 'error', 5600);
  }

  info(message: string): void {
    this.showToast(message, 'info');
  }

  dismissToast(id: string): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  updatePromptValue(fieldId: string, value: string): void {
    const current = this.prompt();
    if (!current) return;
    this.prompt.set({
      ...current,
      fieldError: null,
      values: { ...current.values, [fieldId]: value },
    });
  }

  confirmPrompt(): void {
    const current = this.prompt();
    if (!current) return;
    for (const field of current.fields) {
      if (field.required && !current.values[field.id]?.trim()) {
        this.prompt.set({ ...current, fieldError: `${field.label} is required.` });
        return;
      }
    }
    const resolve = current.resolve;
    this.prompt.set(null);
    resolve(current.values);
  }

  cancelPrompt(): void {
    const current = this.prompt();
    if (!current) return;
    const resolve = current.resolve;
    this.prompt.set(null);
    resolve(null);
  }
}
