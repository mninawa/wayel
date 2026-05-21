import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { preferServerAcceptUrl } from '../utils/invitation-accept-url';
import {
  WayelInvitation,
  WayelInvitationsHttpError,
  WayelInvitationsService,
} from '../services/wayel-invitations.service';

type StatusFilter = '' | WayelInvitation['status'];

interface IssueDraft {
  email: string;
  role: string;
  channel: WayelInvitation['channel'];
  phone: string;
  message: string;
}

const EMPTY_DRAFT: IssueDraft = {
  email: '',
  role: 'Staff',
  channel: 'Email',
  phone: '',
  message: '',
};

/**
 * Shared "manage staff invitations" screen.
 *
 * Wires `GET /api/v1/staff-invitations`, `POST /...`, `POST /{id}/resend`
 * and `POST /{id}/revoke` through the per-portal BFF, and surfaces the
 * one-shot acceptance link the inviter needs to forward to the recipient
 * (Wayel never persists the plaintext token, so the UI shows it once after
 * issue/resend and then forgets).
 *
 * Mounted by:
 *
 *  - <c>REMOVED</c> at <c>/platform/invitations</c> (SuperAdmin issuing
 *    invitations into whichever tenant they're currently scoped to via
 *    "preview as tenant" — the API uses the JWT's <c>tid</c> regardless).
 *  - <c>client-portal</c> at <c>/staff/invitations</c> (TenantAdmin issuing
 *    invitations into their own tenant). This replaced the old Phase 0
 *    mock-backed component so both portals share the exact same wire
 *    contract and copy.
 */
@Component({
  selector: 'wayel-invitations-screen',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <div class="page">
      <header class="hero">
        <div class="hero-text">
          <span class="eyebrow">
            <span class="material-icons-outlined" aria-hidden="true">mail</span>
            Staff invitations
          </span>
          <h1 class="h1">Invite staff to your tenant</h1>
          <p class="lead">
            Issue a one-shot Google sign-in invitation. The recipient signs in
            with their Google account and is automatically bound to this
            tenant with the role you select.
          </p>
        </div>
      </header>

      <section class="card">
        <header class="card-head">
          <h2 class="card-title">New invitation</h2>
          <span class="card-sub">
            The acceptance link is shown <strong>once</strong> after issuing —
            forward it to your recipient before leaving the page.
          </span>
        </header>

        <form class="issue-form" (submit)="issue($event)">
          <label class="field field-grow">
            <span class="field-label">Email</span>
            <input
              type="email"
              required
              autocomplete="off"
              placeholder="staff@example.com"
              [(ngModel)]="draft().email"
              (ngModelChange)="patchDraft({ email: $event })"
              name="email"
            />
          </label>

          <label class="field">
            <span class="field-label">Role</span>
            <select
              [(ngModel)]="draft().role"
              (ngModelChange)="patchDraft({ role: $event })"
              name="role"
            >
              <option value="Staff">Staff</option>
              <option value="TenantAdmin">Tenant admin</option>
            </select>
          </label>

          <label class="field">
            <span class="field-label">Channel</span>
            <select
              [(ngModel)]="draft().channel"
              (ngModelChange)="patchDraft({ channel: $event })"
              name="channel"
            >
              <option value="Email">Email</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Both">Both</option>
            </select>
          </label>

          @if (draft().channel !== 'Email') {
            <label class="field">
              <span class="field-label">Phone</span>
              <input
                type="tel"
                placeholder="+27821234567"
                [(ngModel)]="draft().phone"
                (ngModelChange)="patchDraft({ phone: $event })"
                name="phone"
              />
            </label>
          }

          <label class="field field-grow">
            <span class="field-label">Personal message (optional)</span>
            <input
              type="text"
              placeholder="Welcome to the team!"
              [(ngModel)]="draft().message"
              (ngModelChange)="patchDraft({ message: $event })"
              name="message"
            />
          </label>

          <div class="form-actions">
            <button type="submit" class="btn-primary" [disabled]="issuing()">
              <span class="material-icons-outlined" aria-hidden="true">send</span>
              {{ issuing() ? 'Sending…' : 'Issue invitation' }}
            </button>
          </div>
        </form>

        @if (issueError(); as msg) {
          <div class="banner banner-err">
            <span class="material-icons-outlined" aria-hidden="true">error</span>
            {{ msg }}
          </div>
        }

        @if (lastIssued(); as iss) {
          <div class="banner banner-ok">
            <div class="banner-head">
              <span class="material-icons-outlined" aria-hidden="true">check_circle</span>
              Invitation issued — copy the acceptance link now
            </div>
            <p class="banner-detail">
              <strong>{{ iss.email }}</strong> as <strong>{{ iss.role }}</strong>
              · expires {{ iss.expiresOnUtc | date: 'medium' }}
            </p>
            <div class="copy-row">
              <input
                class="copy-input"
                type="text"
                readonly
                [value]="acceptUrl(iss.token)"
              />
              <button
                type="button"
                class="btn-secondary"
                (click)="copyAcceptUrl(iss.token)"
              >
                <span class="material-icons-outlined" aria-hidden="true">content_copy</span>
                {{ tokenCopied() ? 'Copied' : 'Copy accept link' }}
              </button>
            </div>
            <p class="banner-help">
              Forward the link above to the recipient. Opening it signs them
              in with Google and binds them to this tenant — no follow-up
              instructions needed. The link is single-use; resend if it
              expires before they act.
            </p>
          </div>
        }
      </section>

      <section class="toolbar">
        <label class="filter-field">
          <span class="filter-label">Status</span>
          <select
            class="filter-select"
            [(ngModel)]="statusFilter"
            (ngModelChange)="setStatus($event)"
          >
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Accepted">Accepted</option>
            <option value="Expired">Expired</option>
            <option value="Revoked">Revoked</option>
          </select>
        </label>
        <button type="button" class="btn-secondary" (click)="reload()">
          <span class="material-icons-outlined" aria-hidden="true">refresh</span>
          Refresh
        </button>
      </section>

      @if (loading()) {
        <div class="card empty-card">
          <span class="dot-pulse" aria-hidden="true"></span>
          Loading invitations…
        </div>
      } @else if (loadError()) {
        <div class="card empty-card">
          <span class="empty-icon empty-icon-err">
            <span class="material-icons-outlined" aria-hidden="true">cloud_off</span>
          </span>
          <h3 class="empty-h">We couldn't reach the invitations API</h3>
          <p class="empty-p">{{ loadError() }}</p>
          <button type="button" class="btn-primary" (click)="reload()">
            <span class="material-icons-outlined" aria-hidden="true">refresh</span>
            Try again
          </button>
        </div>
      } @else if (invitations().length === 0) {
        <div class="card empty-card">
          <span class="empty-icon">
            <span class="material-icons-outlined" aria-hidden="true">inbox</span>
          </span>
          <h3 class="empty-h">No invitations yet</h3>
          <p class="empty-p">
            Issue your first invitation using the form above. New invitations
            are visible here immediately.
          </p>
        </div>
      } @else {
        <ul class="inv-list" role="list">
          @for (inv of invitations(); track inv.id) {
            <li class="inv">
              <span class="inv-status" [attr.data-status]="inv.status">
                {{ inv.status }}
              </span>
              <div class="inv-body">
                <div class="inv-top">
                  <span class="inv-email">{{ inv.email }}</span>
                  <span class="inv-role">· {{ inv.role }}</span>
                  <span class="inv-channel">via {{ inv.channel }}</span>
                </div>
                <div class="inv-meta">
                  <span>
                    Created {{ inv.createdOnUtc | date: 'medium' }}
                  </span>
                  <span>
                    Expires {{ inv.expiresOnUtc | date: 'medium' }}
                  </span>
                  @if (inv.acceptedOnUtc) {
                    <span>
                      Accepted {{ inv.acceptedOnUtc | date: 'medium' }}
                    </span>
                  }
                  @if (inv.revokedOnUtc) {
                    <span>
                      Revoked {{ inv.revokedOnUtc | date: 'medium' }}
                    </span>
                  }
                  @if (inv.resendCount > 0) {
                    <span>Resent {{ inv.resendCount }}×</span>
                  }
                </div>
              </div>
              <div class="inv-actions">
                @if (inv.status === 'Pending') {
                  <button
                    type="button"
                    class="btn-secondary"
                    [disabled]="busyId() === inv.id"
                    (click)="resend(inv.id)"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    class="btn-danger"
                    [disabled]="busyId() === inv.id"
                    (click)="revoke(inv.id)"
                  >
                    Revoke
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .page {
      max-width: 960px;
      padding-bottom: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .hero { margin-bottom: 0.25rem; }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0.3rem 0.7rem;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--nk-sky-deep);
      background: var(--nk-sky-soft);
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .eyebrow .material-icons-outlined { font-size: 14px; }
    .h1 {
      margin: 0.65rem 0 0.35rem;
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #0f172a;
    }
    .lead { margin: 0; color: #6b7280; font-size: 0.95rem; line-height: 1.5; max-width: 620px; }

    .card {
      background: var(--surface-0);
      border: 1px solid var(--surface-border);
      border-radius: 14px;
      box-shadow: var(--surface-shadow);
      padding: 1.1rem 1.25rem;
    }
    .card-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 1rem;
    }
    .card-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #111827; }
    .card-sub { font-size: 0.82rem; color: #6b7280; }

    .issue-form {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr;
      gap: 12px 14px;
      align-items: end;
    }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .field-grow { grid-column: span 2; }
    .field-label {
      font-size: 0.72rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .field input,
    .field select {
      appearance: none;
      font: inherit;
      font-size: 0.9rem;
      padding: 0.5rem 0.7rem;
      border-radius: 10px;
      border: 1px solid var(--surface-border);
      background: #fff;
      color: #0f172a;
    }
    .field input:focus,
    .field select:focus {
      outline: none;
      border-color: var(--nk-sky);
      box-shadow: 0 0 0 3px rgba(91, 168, 224, 0.15);
    }
    .form-actions {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
    }

    .btn-primary,
    .btn-secondary,
    .btn-danger {
      appearance: none;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      font-size: 0.85rem;
      padding: 0.55rem 1rem;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary {
      background: var(--nk-sky);
      color: #fff;
      border: 1px solid transparent;
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: #fff;
      color: #374151;
      border: 1px solid var(--surface-border);
    }
    .btn-secondary:hover:not(:disabled) {
      border-color: var(--nk-sky);
      color: var(--nk-sky-deep);
    }
    .btn-danger {
      background: #fff;
      color: #b91c1c;
      border: 1px solid #fca5a5;
    }
    .btn-danger:hover:not(:disabled) { background: #fef2f2; }
    .btn-primary .material-icons-outlined,
    .btn-secondary .material-icons-outlined,
    .btn-danger .material-icons-outlined { font-size: 18px; }

    .banner {
      margin-top: 1rem;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      font-size: 0.88rem;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .banner-err {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      flex-direction: row;
      align-items: center;
    }
    .banner-err .material-icons-outlined { font-size: 18px; }
    .banner-ok {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
    }
    .banner-head {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }
    .banner-detail { margin: 0; color: #14532d; }
    .banner-help { margin: 0; color: #4d7c5f; font-size: 0.78rem; }
    .copy-row { display: flex; gap: 8px; align-items: center; }
    .copy-input {
      flex: 1;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.78rem;
      padding: 0.5rem 0.7rem;
      border-radius: 10px;
      border: 1px solid #bbf7d0;
      background: #fff;
      color: #166534;
    }

    .toolbar {
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }
    .filter-field { display: flex; flex-direction: column; gap: 4px; }
    .filter-label {
      font-size: 0.72rem;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .filter-select {
      appearance: none;
      font: inherit;
      font-size: 0.88rem;
      padding: 0.5rem 0.7rem;
      border-radius: 10px;
      border: 1px solid var(--surface-border);
      background: #fff;
    }

    .empty-card {
      padding: 3rem 1.5rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .empty-icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--nk-sky-soft);
      color: var(--nk-sky-deep);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .empty-icon-err { background: #fef2f2; color: #b91c1c; }
    .empty-icon .material-icons-outlined { font-size: 28px; }
    .empty-h { margin: 0; font-size: 1.05rem; font-weight: 700; color: #111827; }
    .empty-p { margin: 0; color: #6b7280; font-size: 0.88rem; max-width: 420px; }

    .dot-pulse {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--nk-sky);
      animation: pulse 1.2s ease-in-out infinite;
      align-self: center;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.85); }
      50% { opacity: 1; transform: scale(1); }
    }

    .inv-list {
      list-style: none;
      margin: 0;
      padding: 0;
      background: var(--surface-0);
      border: 1px solid var(--surface-border);
      border-radius: 14px;
      box-shadow: var(--surface-shadow);
      overflow: hidden;
    }
    .inv {
      display: grid;
      grid-template-columns: 90px 1fr auto;
      gap: 14px;
      padding: 0.95rem 1.1rem;
      border-bottom: 1px solid var(--surface-border);
      align-items: center;
    }
    .inv:last-child { border-bottom: none; }
    .inv-status {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      text-align: center;
    }
    .inv-status[data-status='Pending']  { background: #fef3c7; color: #b45309; }
    .inv-status[data-status='Accepted'] { background: #d1fae5; color: #047857; }
    .inv-status[data-status='Expired']  { background: #f3f4f6; color: #6b7280; }
    .inv-status[data-status='Revoked']  { background: #fee2e2; color: #b91c1c; }
    .inv-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .inv-top {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px;
    }
    .inv-email { font-weight: 700; color: #111827; }
    .inv-role { color: #4b5563; }
    .inv-channel {
      font-size: 0.72rem;
      color: var(--nk-sky-deep);
      background: var(--nk-sky-soft);
      padding: 0.18rem 0.45rem;
      border-radius: 5px;
      margin-left: auto;
    }
    .inv-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
      font-size: 0.78rem;
      color: #6b7280;
    }
    .inv-actions { display: inline-flex; gap: 8px; }

    @media (max-width: 720px) {
      .issue-form { grid-template-columns: 1fr; }
      .field-grow { grid-column: auto; }
      .inv { grid-template-columns: 1fr; }
      .inv-actions { justify-content: flex-end; }
    }
  `,
})
export class WayelInvitationsScreenComponent {
  private readonly api = inject(WayelInvitationsService);

  protected readonly invitations = signal<WayelInvitation[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected readonly issuing = signal(false);
  protected readonly issueError = signal<string | null>(null);
  protected readonly lastIssued = signal<{
    invitationId: string;
    email: string;
    role: string;
    expiresOnUtc: string;
    token: string;
    /**
     * Server-composed URL when present (preferred — same string we just
     * sent the recipient), null when no AcceptUrlBase is configured and
     * the SPA must fall back to its own origin.
     */
    acceptUrl: string | null;
  } | null>(null);
  protected readonly tokenCopied = signal(false);

  protected statusFilter: StatusFilter = '';
  protected readonly draft = signal<IssueDraft>({ ...EMPTY_DRAFT });

  /** Display-only — reflects whatever filter the toolbar is showing. */
  protected readonly count = computed(() => this.invitations().length);

  constructor() {
    void this.reload();
  }

  protected patchDraft(patch: Partial<IssueDraft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  protected setStatus(value: StatusFilter): void {
    this.statusFilter = value;
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const rows = await this.api.list(this.statusFilter || undefined);
      this.invitations.set(rows);
    } catch (err) {
      this.loadError.set(humanError(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async issue(event: Event): Promise<void> {
    event.preventDefault();
    if (this.issuing()) return;

    this.issuing.set(true);
    this.issueError.set(null);
    this.lastIssued.set(null);
    this.tokenCopied.set(false);

    const d = this.draft();
    try {
      const created = await this.api.create({
        email: d.email.trim(),
        role: d.role.trim(),
        channel: d.channel,
        phone: d.phone.trim() || null,
        message: d.message.trim() || null,
      });
      this.lastIssued.set({
        invitationId: created.invitationId,
        email: created.email,
        role: created.role,
        expiresOnUtc: created.expiresOnUtc,
        token: created.token,
        acceptUrl: created.acceptUrl,
      });
      this.draft.set({ ...EMPTY_DRAFT, channel: d.channel });
      await this.reload();
    } catch (err) {
      this.issueError.set(humanError(err));
    } finally {
      this.issuing.set(false);
    }
  }

  protected async resend(id: string): Promise<void> {
    this.busyId.set(id);
    this.issueError.set(null);
    try {
      const r = await this.api.resend(id);
      const target = this.invitations().find((i) => i.id === id);
      this.lastIssued.set({
        invitationId: id,
        email: target?.email ?? '',
        role: target?.role ?? '',
        expiresOnUtc: r.expiresOnUtc,
        token: r.token,
        acceptUrl: r.acceptUrl,
      });
      this.tokenCopied.set(false);
      await this.reload();
    } catch (err) {
      this.issueError.set(humanError(err));
    } finally {
      this.busyId.set(null);
    }
  }

  protected async revoke(id: string): Promise<void> {
    if (typeof window !== 'undefined' && !window.confirm('Revoke this invitation?')) {
      return;
    }
    this.busyId.set(id);
    this.issueError.set(null);
    try {
      await this.api.revoke(id);
      await this.reload();
    } catch (err) {
      this.issueError.set(humanError(err));
    } finally {
      this.busyId.set(null);
    }
  }

  /**
   * Resolve the full accept URL for a freshly-issued / resent token.
   * Prefer the server-supplied URL when present (it's the same string
   * baked into the recipient's email, composed from
   * `NotificationOptions.AcceptUrlBase*`); fall back to the SPA-side
   * `window.origin`-based URL when the host hasn't configured one,
   * which preserves today's behaviour for plain dev runs.
   */
  protected acceptUrl(token: string): string {
    return preferServerAcceptUrl(this.lastIssued()?.acceptUrl, token);
  }

  /**
   * Copies the *full accept URL* (not just the token) to the
   * clipboard. The previous implementation copied the raw opaque
   * token, which left the recipient with nothing actionable — they'd
   * need the inviter to also paste the right path. Composing the
   * URL here gives the inviter exactly one thing to forward.
   */
  protected copyAcceptUrl(token: string): void {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    const url = preferServerAcceptUrl(this.lastIssued()?.acceptUrl, token);
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      this.tokenCopied.set(true);
      setTimeout(() => this.tokenCopied.set(false), 1800);
    });
  }
}

function humanError(err: unknown): string {
  const candidate = err as WayelInvitationsHttpError | undefined;
  if (candidate && typeof candidate.message === 'string') {
    if (candidate.status === 401) {
      return 'Your session expired. Please sign in again.';
    }
    if (candidate.status === 403) {
      return 'You need TenantAdmin or SuperAdmin to manage invitations.';
    }
    return candidate.message;
  }
  return 'Something went wrong. Please try again.';
}
