import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  BRAND_WATERMARK_OPTIONS,
} from '../branding/brand-watermark.tokens';

/**
 * IBM-style ambient backdrop: subtle grid + large low-opacity wordmark.
 * Mount behind auth / session pages (fixed layer, non-interactive).
 */
@Component({
  selector: 'nk-brand-watermark-backdrop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl()) {
      <div class="wm" aria-hidden="true">
        <div class="wm-grid"></div>
        <div class="wm-vignette"></div>
        <div
          class="wm-logo wm-logo--hero"
          [style.background-image]="'url(' + imageUrl() + ')'"
        ></div>
        <div
          class="wm-logo wm-logo--tile"
          [style.background-image]="'url(' + imageUrl() + ')'"
        ></div>
      </div>
    }
  `,
  styles: `
    .wm {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
      background: linear-gradient(165deg, #f4f6fa 0%, #e8edf4 42%, #f0f4f8 100%);
    }

    .wm-grid {
      position: absolute;
      inset: -1px;
      background-image:
        linear-gradient(rgba(15, 23, 42, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 23, 42, 0.045) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(
        ellipse 90% 75% at 50% 35%,
        #000 15%,
        transparent 72%
      );
    }

    .wm-vignette {
      position: absolute;
      inset: 0;
      background: radial-gradient(
        ellipse 70% 55% at 50% 45%,
        transparent 0%,
        rgba(248, 250, 252, 0.35) 55%,
        rgba(241, 245, 249, 0.85) 100%
      );
    }

    .wm-logo {
      position: absolute;
      background-repeat: no-repeat;
      background-position: center;
      filter: saturate(0.85) contrast(1.02);
    }

    .wm-logo--hero {
      left: 50%;
      top: 46%;
      width: min(72vw, 680px);
      height: min(38vh, 340px);
      transform: translate(-50%, -50%);
      background-size: contain;
      opacity: 0.07;
    }

    .wm-logo--tile {
      inset: -10%;
      background-size: 220px auto;
      background-repeat: repeat;
      opacity: 0.022;
      transform: rotate(-12deg) scale(1.15);
    }

    @media (max-width: 600px) {
      .wm-logo--hero {
        width: 88vw;
        height: 32vh;
        opacity: 0.06;
      }
      .wm-grid {
        background-size: 32px 32px;
      }
    }
  `,
})
export class BrandWatermarkBackdropComponent {
  private readonly opts = inject(BRAND_WATERMARK_OPTIONS);

  readonly imageUrl = computed(() => {
    const url = this.opts.imageUrl?.trim();
    return url ? url : null;
  });
}
