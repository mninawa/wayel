import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * WeYell pulsing ring loader — concentric ripples around a central icon.
 * Use for page sections, tables, and panels while async data is in flight.
 */
@Component({
  selector: 'nk-pulse-loader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nk-pulse-host',
    '[class.nk-pulse-host-block]': 'block()',
    '[class.nk-pulse-host-sm]': 'size() === "sm"',
    '[class.nk-pulse-host-lg]': 'size() === "lg"',
  },
  template: `
    <div class="nk-pulse" role="status" aria-live="polite">
      <div class="nk-pulse-visual" aria-hidden="true">
        <span class="nk-pulse-ring"></span>
        <span class="nk-pulse-ring"></span>
        <span class="nk-pulse-ring"></span>
        <span class="nk-pulse-core">
          <span class="material-icons-outlined">{{ icon() }}</span>
        </span>
      </div>
      @if (label()) {
        <p class="nk-pulse-label">{{ label() }}</p>
      } @else {
        <span class="sr-only">Loading…</span>
      }
    </div>
  `,
  styles: `
    :host.nk-pulse-host {
      display: inline-flex;
    }

    :host.nk-pulse-host-block {
      display: flex;
      width: 100%;
      justify-content: center;
    }

    .nk-pulse {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.85rem;
      padding: 0.35rem 0;
    }

    :host.nk-pulse-host-block .nk-pulse {
      padding: 2.5rem 1rem;
      min-height: 10rem;
    }

    :host.nk-pulse-host-sm .nk-pulse {
      gap: 0.5rem;
      padding: 0.25rem 0;
    }

    :host.nk-pulse-host-sm.nk-pulse-host-block .nk-pulse {
      padding: 1.25rem 0.75rem;
      min-height: 6rem;
    }

    :host.nk-pulse-host-lg.nk-pulse-host-block .nk-pulse {
      padding: 3.5rem 1rem;
      min-height: 14rem;
    }

    .nk-pulse-visual {
      position: relative;
      width: 5rem;
      height: 5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    :host.nk-pulse-host-sm .nk-pulse-visual {
      width: 3.25rem;
      height: 3.25rem;
    }

    :host.nk-pulse-host-lg .nk-pulse-visual {
      width: 6.25rem;
      height: 6.25rem;
    }

    .nk-pulse-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: color-mix(in srgb, var(--nk-pulse-color, #c3f832) 34%, transparent);
      animation: nk-pulse-ring 2.4s ease-out infinite;
    }

    .nk-pulse-ring:nth-child(2) {
      animation-delay: 0.8s;
    }

    .nk-pulse-ring:nth-child(3) {
      animation-delay: 1.6s;
    }

    .nk-pulse-core {
      position: relative;
      z-index: 1;
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    :host.nk-pulse-host-sm .nk-pulse-core {
      width: 2rem;
      height: 2rem;
    }

    :host.nk-pulse-host-lg .nk-pulse-core {
      width: 3.5rem;
      height: 3.5rem;
    }

    .nk-pulse-core .material-icons-outlined {
      font-size: 1.45rem !important;
      color: var(--nk-text, #292928);
    }

    :host.nk-pulse-host-sm .nk-pulse-core .material-icons-outlined {
      font-size: 1rem !important;
    }

    :host.nk-pulse-host-lg .nk-pulse-core .material-icons-outlined {
      font-size: 1.75rem !important;
    }

    .nk-pulse-label {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--nk-muted, #6b7280);
      text-align: center;
      line-height: 1.45;
    }

    :host.nk-pulse-host-sm .nk-pulse-label {
      font-size: 0.78rem;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @keyframes nk-pulse-ring {
      0% {
        transform: scale(0.5);
        opacity: 0.55;
      }
      70%,
      100% {
        transform: scale(1.2);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .nk-pulse-ring {
        animation: none;
        opacity: 0.25;
        transform: scale(0.85);
      }

      .nk-pulse-ring:nth-child(2),
      .nk-pulse-ring:nth-child(3) {
        display: none;
      }
    }
  `,
})
export class PulseLoaderComponent {
  readonly label = input<string | null>(null);
  readonly icon = input('local_shipping');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** When true, centres the loader in the full width of its container. */
  readonly block = input(true);
}
