import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ProfileFormComponent } from '../account/profile-form.component';
import type { UpdateProfileRequest } from '../../models/customer-account.models';
import { CustomerAccountService } from '../../services/customer-account.service';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [RouterLink, ProfileFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="onboard">
      <aside class="sidebar">
        <a routerLink="/sign-in" class="brand">
          <strong>WeYell</strong>
          <small>Shop in South Africa. Deliver to Eswatini.</small>
        </a>
        <div class="stepper">
          <div class="step done"><span>✓</span> Sign in with Google</div>
          <div class="step active"><span>2</span> Complete profile</div>
          <div class="step"><span>3</span> Choose suite plan</div>
          <div class="step"><span>4</span> Payment</div>
        </div>
      </aside>

      <main class="main">
        <header class="top">
          @if (account(); as acc) {
            <span class="google-chip">
              <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true">
                <path fill="#4285F4" d="M24 12c2.5 0 4.7.9 6.4 2.4l4.8-4.8C32.2 6.5 28.3 4.5 24 4.5 15.2 4.5 8 11.7 8 20.5s7.2 16 16 16c7.4 0 13.7-4.8 15.9-11.5h-16v-8.5H38c.3 1.5.5 3 .5 4.5 0 10.2-8.3 18.5-18.5 18.5S5.5 30.7 5.5 20.5 13.8 2 24 2z"/>
              </svg>
              Signed in as {{ acc.profile.email }}
            </span>
          }
        </header>

        <section class="bb-card bb-card-pad content">
          <h1>Complete your profile</h1>
          <p class="sub">
            Before we assign your South African suite number, we need a few details for customs and delivery to Eswatini.
          </p>

          <div class="info-banner">
            <span class="material-icons-outlined">verified_user</span>
            <p>Your suite is <strong>not active yet</strong>. Finish this step to become eligible for suite access.</p>
          </div>

          @if (account(); as acc) {
            <app-profile-form
              [profile]="acc.profile"
              [saving]="saving()"
              [saveError]="saveError()"
              (saved)="onSave($event)"
              (cancelled)="signOut()"
            />
          }
        </section>
      </main>
    </div>
  `,
  styles: `
    .onboard { display: flex; min-height: 100vh; }
    .sidebar {
      width: var(--bb-sidebar-w);
      background: var(--bb-navy);
      color: #fff;
      padding: 1.25rem 0.85rem;
      display: flex;
      flex-direction: column;
    }
    .brand {
      color: #fff;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      margin-bottom: 2rem;
      line-height: 1.25;
    }
    .brand small { opacity: 0.65; font-size: 0.65rem; font-weight: 400; }
    .stepper { display: flex; flex-direction: column; gap: 0.5rem; }
    .step {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.82rem;
      opacity: 0.55;
      padding: 0.4rem 0.5rem;
    }
    .step span:first-child {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: 700;
    }
    .step.done { opacity: 0.85; }
    .step.done span:first-child { background: var(--bb-primary); border-color: var(--bb-primary); }
    .step.active { opacity: 1; font-weight: 600; }
    .step.active span:first-child { border-color: #fff; color: #fff; }
    .main { flex: 1; background: var(--bb-bg); padding: 1.5rem 2rem; }
    .top { margin-bottom: 1rem; }
    .google-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.75rem;
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: 999px;
      font-size: 0.8rem;
      color: var(--bb-muted);
    }
    .content { max-width: 560px; }
    .content h1 { margin: 0 0 0.35rem; font-size: 1.5rem; }
    .sub { margin: 0 0 1.25rem; color: var(--bb-muted); font-size: 0.9rem; }
    .info-banner {
      display: flex;
      gap: 0.5rem;
      padding: 0.85rem 1rem;
      background: var(--bb-primary-soft);
      border-radius: var(--bb-radius-sm);
      margin-bottom: 1.25rem;
      font-size: 0.85rem;
      color: var(--bb-primary-deep);
    }
    .info-banner p { margin: 0; }
  `,
})
export class CompleteProfileComponent implements OnInit {
  private readonly accountApi = inject(CustomerAccountService);
  private readonly router = inject(Router);

  readonly account = this.accountApi.account;
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.account()) {
      this.accountApi.loadAccount().subscribe();
    }
  }

  onSave(body: UpdateProfileRequest): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.accountApi.completeOnboardingProfile(body).subscribe({
      next: (acc) => {
        this.saving.set(false);
        void this.router.navigateByUrl(this.accountApi.getPostAuthRoute({
          profileComplete: acc.profileComplete,
          suiteEligible: acc.suiteEligible,
          hasSuite: acc.hasSuite,
          hasPayLaterIntent: acc.onboardingIntent?.kind === 'pay_later',
        }));
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | string | null;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object') {
        return body.detail ?? body.title ?? 'Could not save profile. Try again.';
      }
    }
    if (err instanceof Error && err.message) return err.message;
    return 'Could not save profile. Try again.';
  }

  signOut(): void {
    void this.router.navigate(['/sign-in']);
  }
}
