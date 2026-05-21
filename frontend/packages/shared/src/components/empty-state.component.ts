import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * A consistent empty-state block to drop into list pages when a collection
 * comes back empty. Replaces the prior `<p class="muted">No X yet.</p>`
 * one-liners with a centered icon + heading + description + optional action
 * slot, so every list page tells the user what they're seeing and what to do
 * about it.
 *
 * Usage:
 * ```html
 * <nk-empty
 *   icon="inbox"
 *   title="No invitations yet"
 *   description="Send your first invite from the button up top."
 * >
 *   <button class="btn primary">Invite someone</button>
 * </nk-empty>
 * ```
 */
@Component({
  selector: 'nk-empty',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <div class="icon" aria-hidden="true">{{ iconChar() }}</div>
      <h3 class="title">{{ title() }}</h3>
      @if (description()) {
        <p class="desc">{{ description() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.5rem; padding: 2.4rem 1rem; text-align: center;
      color: var(--nk-muted, #6b7280);
    }
    .icon {
      width: 56px; height: 56px; border-radius: 16px;
      background: linear-gradient(135deg, #eef2ff, #e0e7ff);
      color: #4338ca; font-size: 28px; font-weight: 700;
      display: grid; place-items: center;
      box-shadow: inset 0 0 0 1px rgba(67, 56, 202, 0.12);
    }
    .title {
      margin: 0.6rem 0 0; font-size: 1rem; font-weight: 700;
      color: #111827;
    }
    .desc {
      margin: 0; font-size: 0.88rem; max-width: 38ch; line-height: 1.45;
    }
    .actions { margin-top: 0.6rem; display: flex; gap: 0.5rem; }
    .actions:empty { display: none; }
  `,
})
export class EmptyStateComponent {
  readonly icon = input<string | null>(null);
  readonly title = input<string>('Nothing here yet');
  readonly description = input<string | null>(null);

  /**
   * Resolve the small per-context glyph. We avoid a full icon-font dependency
   * by mapping a handful of meaningful keys to inline emoji / unicode that
   * render predictably across platforms; unknown keys fall back to a generic
   * dotted square so callers can opt out of the iconography.
   */
  protected readonly iconChar = computed(() => {
    switch ((this.icon() ?? '').trim()) {
      case 'inbox': return '\u2709';
      case 'search': return '\u2315';
      case 'people': return '\u{1F465}';
      case 'calendar': return '\u{1F4C5}';
      case 'star': return '\u2605';
      case 'shield': return '\u{1F6E1}';
      case 'doc': return '\u{1F4C4}';
      case 'audit': return '\u2261';
      case 'plus': return '+';
      default: return '\u25A2';
    }
  });
}
