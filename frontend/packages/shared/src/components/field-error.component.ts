import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Inline form-field error message — pairs with `.field > .input` blocks
 * across the app. Renders a small red alert line with an icon glyph and is
 * `role="alert"` so it's announced when it first appears.
 *
 * Stays out of the layout when there is nothing to show.
 *
 * Usage:
 * ```html
 * <label class="field">
 *   <span class="label">Email</span>
 *   <input class="input" [class.invalid]="!!emailError()" />
 *   <nk-field-error [message]="emailError()" />
 * </label>
 * ```
 */
@Component({
  selector: 'nk-field-error',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <p class="err" role="alert">
        <span class="dot" aria-hidden="true">!</span>
        <span class="msg">{{ message() }}</span>
      </p>
    }
  `,
  styles: `
    :host { display: block; min-height: 0; }
    .err {
      display: flex; align-items: center; gap: 0.4rem;
      margin: 0.3rem 0 0;
      font-size: 0.78rem; color: #b91c1c;
    }
    .dot {
      display: inline-grid; place-items: center;
      width: 16px; height: 16px; border-radius: 50%;
      background: #fee2e2; color: #b91c1c;
      font-weight: 800; font-size: 11px; line-height: 1;
    }
    .msg { line-height: 1.35; }
  `,
})
export class FieldErrorComponent {
  readonly message = input<string | null | undefined>(null);

  protected readonly visible = computed(
    () => (this.message() ?? '').trim().length > 0,
  );
}
