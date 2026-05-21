import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <div class="card">
        <span class="badge">404</span>
        <span class="art" aria-hidden="true">
          <span class="art-cloud">
            <span class="material-icons-outlined">cloud_off</span>
          </span>
          <span class="art-dots" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
        </span>
        <h1>We couldn't find that page</h1>
        <p>
          The link may be broken or the page may have moved. Let's get you
          back to somewhere familiar.
        </p>
        <div class="actions">
          <a class="btn-primary" [routerLink]="homeLink()">
            <span class="material-icons-outlined" aria-hidden="true">home</span>
            Go to {{ homeLabel() }}
          </a>
          <a class="btn-secondary" routerLink="/">
            <span class="material-icons-outlined" aria-hidden="true">explore</span>
            Welcome
          </a>
        </div>
      </div>
    </main>
  `,
  styles: [
    `
      :host { display: block; }
      .wrap {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 32px 16px;
        background:
          radial-gradient(700px 360px at 10% 20%, rgba(236, 72, 153, 0.10), transparent 60%),
          radial-gradient(700px 360px at 90% 80%, rgba(139, 92, 246, 0.10), transparent 60%),
          #fff;
      }
      .card {
        max-width: 480px;
        width: 100%;
        text-align: center;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        padding: 36px 28px 30px;
        box-shadow: 0 30px 60px -45px rgba(15, 23, 42, 0.25);
      }
      .badge {
        display: inline-block;
        font-weight: 700;
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        color: #be185d;
        background: #fce7f3;
        padding: 4px 10px;
        border-radius: 999px;
        margin-bottom: 14px;
      }
      .art {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 96px;
        height: 96px;
        margin-bottom: 18px;
      }
      .art-cloud {
        width: 84px;
        height: 84px;
        border-radius: 24px;
        background: linear-gradient(135deg, #fdf2f8, #ede9fe);
        color: #ec4899;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 16px 32px -22px rgba(236, 72, 153, 0.55);
      }
      .art-cloud .material-icons-outlined { font-size: 42px; }
      .art-dots {
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        display: inline-flex;
        gap: 4px;
      }
      .art-dots i {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: #ec4899;
        opacity: 0.5;
        animation: bounce 1.2s ease-in-out infinite;
      }
      .art-dots i:nth-child(2) { animation-delay: 0.15s; background: #8b5cf6; }
      .art-dots i:nth-child(3) { animation-delay: 0.30s; background: #f97316; }
      @keyframes bounce {
        0%,100% { transform: translateY(0); opacity: 0.5; }
        50%     { transform: translateY(-4px); opacity: 1; }
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.4rem;
        font-weight: 700;
        color: #111827;
        letter-spacing: -0.01em;
      }
      p {
        margin: 0 0 22px;
        color: #6b7280;
        font-size: 0.92rem;
        line-height: 1.55;
      }
      .actions {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: center;
      }
      .btn-primary,
      .btn-secondary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        border-radius: 12px;
        font: inherit;
        font-weight: 600;
        font-size: 0.88rem;
        text-decoration: none;
        cursor: pointer;
        transition: filter 0.15s, border-color 0.15s, color 0.15s;
      }
      .btn-primary {
        background: linear-gradient(135deg, #f97316, #ec4899);
        color: #fff;
        border: none;
        box-shadow: 0 12px 22px -14px rgba(236, 72, 153, 0.55);
      }
      .btn-primary:hover { filter: brightness(1.05); }
      .btn-secondary {
        background: #fff;
        color: #374151;
        border: 1px solid #e5e7eb;
      }
      .btn-secondary:hover { color: #ec4899; border-color: #fbcfe8; }
      .btn-primary .material-icons-outlined,
      .btn-secondary .material-icons-outlined { font-size: 18px; }
    `,
  ],
})
export class NotFoundComponent {
  private readonly session = inject(AccountSessionService);

  readonly homeLink = computed(() => {
    if (!this.session.isSignedIn()) return '/';
    return this.session.homeRouteForRole();
  });

  readonly homeLabel = computed(() => {
    const r = this.session.role();
    if (r === 'staff') return 'my institutions';
    if (r === 'parent') return 'my children';
    return 'home';
  });
}
