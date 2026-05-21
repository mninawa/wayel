import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Reusable shimmering placeholder. Renders a neutral, animated rectangle
 * (or a stack of rectangles, when `lines > 1`) to occupy the same vertical
 * space the real content will eventually take — eliminating layout jank when
 * lists / cards finish loading.
 *
 * Variants:
 *   - `text`   — a thin line; pair with `lines` to mimic a paragraph.
 *   - `card`   — a tall rectangle for full row/card replacements.
 *   - `circle` — a square avatar-shaped block.
 *   - `pill`   — a short, rounded chip-shaped block (badges, counts).
 *
 * Honors `prefers-reduced-motion` by disabling the shimmer animation.
 */
@Component({
  selector: 'nk-skeleton',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'text' && lines() > 1) {
      <span class="stack" aria-hidden="true">
        @for (i of lineArray(); track i) {
          <span
            class="bar text"
            [style.width]="i === lines() - 1 ? '60%' : '100%'"
          ></span>
        }
      </span>
    } @else {
      <span
        class="bar"
        [class.text]="variant() === 'text'"
        [class.card]="variant() === 'card'"
        [class.circle]="variant() === 'circle'"
        [class.pill]="variant() === 'pill'"
        [style.width]="width()"
        [style.height]="height()"
        aria-hidden="true"
      ></span>
    }
    <span class="sr-only">Loading…</span>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; }
    .bar {
      display: inline-block;
      background: linear-gradient(
        90deg,
        rgba(15, 23, 42, 0.06) 0%,
        rgba(15, 23, 42, 0.12) 50%,
        rgba(15, 23, 42, 0.06) 100%
      );
      background-size: 200% 100%;
      animation: nk-skeleton-shimmer 1.4s linear infinite;
      border-radius: 6px;
    }
    .bar.text   { height: 0.85em; width: 100%; border-radius: 4px; }
    .bar.card   { height: 64px;   width: 100%; border-radius: 12px; }
    .bar.circle { width: 36px;    height: 36px; border-radius: 50%; }
    .bar.pill   { height: 1.1em;  width: 3.5em; border-radius: 999px; }
    .stack { display: flex; flex-direction: column; gap: 0.4em; width: 100%; }
    .stack .bar { width: 100%; }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
    @keyframes nk-skeleton-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar { animation: none; }
    }
  `,
})
export class SkeletonComponent {
  readonly variant = input<'text' | 'card' | 'circle' | 'pill'>('text');
  readonly lines = input<number, number | string | null | undefined>(1, {
    transform: (v) => Math.max(1, Math.floor(Number(v) || 1)),
  });
  readonly width = input<string | null>(null);
  readonly height = input<string | null>(null);

  protected readonly lineArray = computed(() =>
    Array.from({ length: this.lines() }, (_, i) => i),
  );
}
