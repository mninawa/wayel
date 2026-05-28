import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Scrolling banner prompting customers to complete KYC until verified. */
@Component({
  selector: 'app-kyc-verification-ticker',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kyc-ticker" role="status" aria-live="polite">
      <div class="kyc-ticker-viewport">
        <div class="kyc-ticker-track">
          @for (copy of [0, 1]; track copy) {
            <p class="kyc-ticker-segment">
              <span class="material-icons-outlined" aria-hidden="true">verified_user</span>
              <span>The account is not verified — please</span>
              <a routerLink="/my-address" fragment="kyc" class="kyc-ticker-link">complete the KYC here</a>
              <span class="kyc-ticker-dot" aria-hidden="true">•</span>
            </p>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .kyc-ticker {
      flex-shrink: 0;
      background: linear-gradient(90deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%);
      border-bottom: 1px solid #f59e0b;
      color: #78350f;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .kyc-ticker-viewport {
      overflow: hidden;
      width: 100%;
      padding: 0.55rem 0;
    }

    .kyc-ticker-track {
      display: flex;
      width: max-content;
      animation: kyc-ticker-scroll 22s linear infinite;
    }

    .kyc-ticker-segment {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      margin: 0;
      padding: 0 2.5rem;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .kyc-ticker-segment .material-icons-outlined {
      font-size: 1.1rem !important;
      color: #b45309;
    }

    .kyc-ticker-link {
      color: #92400e;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .kyc-ticker-link:hover {
      color: #451a03;
    }

    .kyc-ticker-dot {
      opacity: 0.55;
      margin-left: 0.25rem;
    }

    @keyframes kyc-ticker-scroll {
      from {
        transform: translateX(0);
      }
      to {
        transform: translateX(-50%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .kyc-ticker-viewport {
        overflow: visible;
      }

      .kyc-ticker-track {
        width: 100%;
        animation: none;
        justify-content: center;
      }

      .kyc-ticker-segment:last-child {
        display: none;
      }

      .kyc-ticker-segment {
        padding: 0 1rem;
        white-space: normal;
        text-align: center;
        justify-content: center;
        flex-wrap: wrap;
        width: 100%;
      }
    }
  `,
})
export class KycVerificationTickerComponent {}
