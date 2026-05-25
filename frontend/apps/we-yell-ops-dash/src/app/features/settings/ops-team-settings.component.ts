import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  OpsAuthService,
  type OpsInvitationDto,
  type OpsUserDto,
} from '../../services/ops-auth.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';

@Component({
  selector: 'ops-team-settings',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a routerLink="/ops/receiving" class="back-link">← Back to overview</a>
      <h1>Warehouse team</h1>
      <p class="lead">Invite colleagues and manage roles. Only leads can change access.</p>

      @if (!canManage()) {
        <p class="err">Your role cannot manage warehouse users.</p>
      } @else {
        <section class="ops-card ops-card-pad">
          <h2 class="ops-card-title">Invite user</h2>
          <div class="invite-row">
            <label>
              <span>Email</span>
              <input type="email" [(ngModel)]="inviteEmail" name="inviteEmail" placeholder="name@company.com" />
            </label>
            <label>
              <span>Role</span>
              <select [(ngModel)]="inviteRole" name="inviteRole">
                <option value="clerk">Clerk</option>
                <option value="lead">Lead</option>
                <option value="finance">Finance</option>
              </select>
            </label>
            <button type="button" class="ops-btn ops-btn-primary" [disabled]="busy()" (click)="sendInvite()">
              Send invitation
            </button>
          </div>
          @if (message()) { <p class="ok">{{ message() }}</p> }
          @if (error()) { <p class="err">{{ error() }}</p> }
        </section>

        <section class="ops-card ops-card-pad">
          <h2 class="ops-card-title">Pending invitations</h2>
          @if (invitations().length === 0) {
            <p class="hint">No invitations yet.</p>
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (row of invitations(); track row.id) {
                  <tr>
                    <td>{{ row.email }}</td>
                    <td>{{ row.role }}</td>
                    <td>{{ row.status }}</td>
                    <td>{{ row.expiresAtUtc | date:'mediumDate' }}</td>
                    <td>
                      @if (row.status === 'Pending' && row.invitePath) {
                        <code class="invite-link">{{ origin }}{{ row.invitePath }}</code>
                        <button type="button" class="link-btn" (click)="revoke(row.id)">Revoke</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <section class="ops-card ops-card-pad">
          <h2 class="ops-card-title">Active users</h2>
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td>{{ u.displayName }}</td>
                  <td>{{ u.email }}</td>
                  <td>
                    <select [ngModel]="u.role" (ngModelChange)="changeRole(u, $event)" [disabled]="busy()">
                      <option value="clerk">Clerk</option>
                      <option value="lead">Lead</option>
                      <option value="finance">Finance</option>
                    </select>
                  </td>
                  <td>{{ u.isDisabled ? 'Disabled' : 'Active' }}</td>
                  <td>{{ u.lastLoginAtUtc ? (u.lastLoginAtUtc | date:'medium') : '—' }}</td>
                  <td>
                    <button type="button" class="link-btn" (click)="toggleDisabled(u)">
                      {{ u.isDisabled ? 'Enable' : 'Disable' }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    </div>
  `,
  styles: `
    .page { max-width: 960px; }
    .back-link { color: var(--ops-primary); text-decoration: none; font-weight: 600; font-size: 0.85rem; }
    h1 { margin: 0.75rem 0 0.25rem; }
    .lead { color: var(--ops-muted); margin: 0 0 1.25rem; }
    .invite-row { display: grid; grid-template-columns: 1.4fr 0.8fr auto; gap: 0.75rem; align-items: end; }
    @media (max-width: 720px) { .invite-row { grid-template-columns: 1fr; } }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; font-weight: 600; color: var(--ops-muted); }
    label input, label select { padding: 0.55rem 0.7rem; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); font: inherit; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .data-table th, .data-table td { text-align: left; padding: 0.55rem 0.4rem; border-bottom: 1px solid var(--ops-border); vertical-align: top; }
    .data-table th { color: var(--ops-muted); font-size: 0.72rem; text-transform: uppercase; }
    .invite-link { display: block; font-size: 0.72rem; word-break: break-all; margin-bottom: 0.25rem; }
    .link-btn { border: none; background: none; color: var(--ops-primary); font-weight: 600; cursor: pointer; padding: 0; }
    .hint, .ok, .err { font-size: 0.85rem; }
    .ok { color: #15803d; }
    .err { color: #b91c1c; }
  `,
})
export class OpsTeamSettingsComponent implements OnInit {
  private readonly session = inject(OpsSessionService);
  private readonly api = inject(OpsAuthService);

  readonly origin = typeof window !== 'undefined' ? window.location.origin : '';
  readonly users = signal<OpsUserDto[]>([]);
  readonly invitations = signal<OpsInvitationDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  inviteEmail = '';
  inviteRole = 'clerk';

  canManage(): boolean {
    return this.session.can(OPS_CAP.teamManage);
  }

  ngOnInit(): void {
    if (!this.canManage()) return;
    this.reload();
  }

  sendInvite(): void {
    const token = this.session.accessToken();
    if (!token || !this.inviteEmail.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.createInvitation(token, this.inviteEmail.trim(), this.inviteRole).subscribe({
      next: (inv) => {
        this.busy.set(false);
        this.inviteEmail = '';
        this.message.set(`Invitation created for ${inv.email}. Share the invite link from the table below.`);
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  revoke(id: string): void {
    const token = this.session.accessToken();
    if (!token) return;
    this.api.revokeInvitation(token, id).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  changeRole(user: OpsUserDto, role: string): void {
    const token = this.session.accessToken();
    if (!token || role === user.role) return;
    this.api.updateUserRole(token, user.id, role).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  toggleDisabled(user: OpsUserDto): void {
    const token = this.session.accessToken();
    if (!token) return;
    this.api.setUserDisabled(token, user.id, !user.isDisabled).subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  private reload(): void {
    const token = this.session.accessToken();
    if (!token) return;
    this.api.listUsers(token).subscribe({ next: (rows) => this.users.set(rows) });
    this.api.listInvitations(token).subscribe({ next: (rows) => this.invitations.set(rows) });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Request failed.';
  }
}
