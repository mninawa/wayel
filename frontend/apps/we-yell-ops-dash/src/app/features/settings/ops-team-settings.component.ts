import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  OpsAuthService,
  type OpsAuditEntryDto,
  type OpsInvitationDto,
  type OpsUserDto,
} from '../../services/ops-auth.service';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsSessionService } from '../../services/ops-session.service';

interface RoleDescription {
  key: 'lead' | 'finance' | 'clerk';
  label: string;
  badge: string;
  blurb: string;
  bullets: string[];
}

/**
 * Lookup map that turns a raw audit `Action` string into a friendly icon /
 * label / phrasing pair the activity feed can render. Falls back to a
 * generic "system event" rendering for unknown actions so new domains
 * never break the UI.
 */
interface AuditActionPresenter {
  icon: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
  describe: (entry: OpsAuditEntryDto) => string;
}

@Component({
  selector: 'ops-team-settings',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ops-team-settings.component.html',
  styleUrl: './ops-team-settings.component.css',
})
export class OpsTeamSettingsComponent implements OnInit {
  private readonly session = inject(OpsSessionService);
  private readonly api = inject(OpsAuthService);

  readonly origin = typeof window !== 'undefined' ? window.location.origin : '';

  // ── Page state ──────────────────────────────────────────────────────
  readonly users = signal<OpsUserDto[]>([]);
  readonly invitations = signal<OpsInvitationDto[]>([]);
  readonly audit = signal<OpsAuditEntryDto[]>([]);
  readonly busy = signal(false);
  readonly auditBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  // Filters
  readonly userFilter = signal('');
  readonly inviteSearch = signal('');

  // ── Your access (snapshot of the signed-in operator) ────────────────
  readonly meEmail = computed(() => this.session.email());
  readonly meName = computed(() => this.session.actorName());
  readonly meRole = computed(() => this.session.role());
  readonly meCapabilities = computed(() => this.session.capabilities());

  /** Role descriptions inlined as a learning aid — keeps ops staff
   *  honest about what each role can/cannot do without bouncing to docs.
   *  Mirrors the server-side capability matrix in OpsPermissions.cs.   */
  readonly roleCatalog: RoleDescription[] = [
    {
      key: 'lead',
      label: 'Lead',
      badge: 'lead',
      blurb: 'Full warehouse + platform admin. The only role allowed to manage the ops team.',
      bullets: [
        'Intake, inspect, upload invoice, verify invoice',
        'Manage exceptions, send parcels to quote',
        'Picking, packing, dispatch, warehouse admin',
        'Manage team (invite, change roles, disable)',
        'View recent activity feed',
      ],
    },
    {
      key: 'finance',
      label: 'Finance',
      badge: 'finance',
      blurb: 'Read-mostly. Verifies invoices and sends finalised quotes to customers.',
      bullets: [
        'Verify invoices, view invoice details',
        'Send parcels to quote',
        'Read warehouse data, search',
      ],
    },
    {
      key: 'clerk',
      label: 'Clerk',
      badge: 'clerk',
      blurb: 'The hands-on warehouse role — receive parcels and keep them moving.',
      bullets: [
        'Intake, inspect, upload invoice (no verify)',
        'View invoices',
        'Picking, packing, dispatch (no admin)',
      ],
    },
  ];

  // ── Invite form state ───────────────────────────────────────────────
  inviteEmail = '';
  inviteRole = 'clerk';
  readonly recentInviteLink = signal<string | null>(null);

  // ── Filtered views ──────────────────────────────────────────────────
  readonly filteredUsers = computed(() => {
    const q = this.userFilter().trim().toLowerCase();
    const rows = this.users();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q)
        || u.email.toLowerCase().includes(q)
        || u.role.toLowerCase().includes(q),
    );
  });

  readonly pendingInvitations = computed(() =>
    this.invitations().filter((i) => i.status === 'Pending'),
  );

  readonly filteredPendingInvitations = computed(() => {
    const q = this.inviteSearch().trim().toLowerCase();
    const rows = this.pendingInvitations();
    if (!q) return rows;
    return rows.filter(
      (i) => i.email.toLowerCase().includes(q) || i.role.toLowerCase().includes(q),
    );
  });

  // ── Audit presenter ─────────────────────────────────────────────────
  private readonly auditPresenters: Record<string, AuditActionPresenter> = {
    'ops.user.invited': {
      icon: 'mail',
      tone: 'info',
      describe: (e) =>
        `${e.actorEmail ?? 'A lead'} invited ${this.fmtTarget(e, 'invitee.email')} as ${this.fmtTarget(e, 'invitee.role')}.`,
    },
    'ops.user.invite_revoked': {
      icon: 'cancel',
      tone: 'warn',
      describe: (e) => `${e.actorEmail ?? 'A lead'} revoked invitation ${this.fmtTarget(e, 'invitee.email')}.`,
    },
    'ops.user.role_changed': {
      icon: 'admin_panel_settings',
      tone: 'info',
      describe: (e) =>
        `${e.actorEmail ?? 'A lead'} changed ${this.fmtTarget(e, 'target.email')} to role "${this.fmtTarget(e, 'to.role')}".`,
    },
    'ops.user.disabled': {
      icon: 'block',
      tone: 'bad',
      describe: (e) => `${e.actorEmail ?? 'A lead'} disabled ${this.fmtTarget(e, 'target.email')}.`,
    },
    'ops.user.enabled': {
      icon: 'check_circle',
      tone: 'good',
      describe: (e) => `${e.actorEmail ?? 'A lead'} re-enabled ${this.fmtTarget(e, 'target.email')}.`,
    },
    'ops.customer.deleted': {
      icon: 'person_remove',
      tone: 'bad',
      describe: (e) =>
        `${e.actorEmail ?? 'A lead'} deleted customer ${this.fmtTarget(e, 'customer.email')}.`,
    },
    'kyc.review.approved': {
      icon: 'verified',
      tone: 'good',
      describe: (e) =>
        `${e.actorEmail ?? 'Reviewer'} approved KYC for ${this.fmtTarget(e, 'customer.email')}.`,
    },
    'kyc.review.rejected': {
      icon: 'gpp_bad',
      tone: 'warn',
      describe: (e) =>
        `${e.actorEmail ?? 'Reviewer'} rejected KYC for ${this.fmtTarget(e, 'customer.email')}.`,
    },
  };

  canManage(): boolean {
    return this.session.can(OPS_CAP.teamManage);
  }

  ngOnInit(): void {
    if (!this.canManage()) return;
    this.reload();
    this.loadAudit();
  }

  // ── Reload data ─────────────────────────────────────────────────────
  reload(): void {
    const token = this.session.accessToken();
    if (!token) return;
    this.api.listUsers(token).subscribe({ next: (rows) => this.users.set(rows) });
    this.api.listInvitations(token).subscribe({ next: (rows) => this.invitations.set(rows) });
  }

  loadAudit(): void {
    const token = this.session.accessToken();
    if (!token) return;
    this.auditBusy.set(true);
    this.api.listRecentAudit(token, { pageSize: 20 }).subscribe({
      next: (page) => {
        this.audit.set(page.items);
        this.auditBusy.set(false);
      },
      error: () => {
        this.audit.set([]);
        this.auditBusy.set(false);
      },
    });
  }

  // ── Invitations ─────────────────────────────────────────────────────
  sendInvite(): void {
    const token = this.session.accessToken();
    if (!token || !this.inviteEmail.trim()) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    this.recentInviteLink.set(null);
    this.api.createInvitation(token, this.inviteEmail.trim(), this.inviteRole).subscribe({
      next: (inv) => {
        this.busy.set(false);
        this.message.set(`Invitation created for ${inv.email}. Share the link below.`);
        if (inv.invitePath) {
          this.recentInviteLink.set(`${this.origin}${inv.invitePath}`);
        }
        this.inviteEmail = '';
        this.reload();
        this.loadAudit();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  revoke(id: string): void {
    if (typeof window !== 'undefined' && !window.confirm('Revoke this invitation?')) return;
    const token = this.session.accessToken();
    if (!token) return;
    this.api.revokeInvitation(token, id).subscribe({
      next: () => {
        this.message.set('Invitation revoked.');
        this.reload();
        this.loadAudit();
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  copyInviteLink(invite: OpsInvitationDto): void {
    if (!invite.invitePath) return;
    const url = `${this.origin}${invite.invitePath}`;
    this.copyToClipboard(url, `Invite link for ${invite.email} copied to clipboard.`);
  }

  copyRecentInviteLink(): void {
    const link = this.recentInviteLink();
    if (!link) return;
    this.copyToClipboard(link, 'Invite link copied to clipboard.');
  }

  // ── Users ───────────────────────────────────────────────────────────
  isSelf(user: OpsUserDto): boolean {
    const me = this.meEmail().trim().toLowerCase();
    return !!me && me === user.email.trim().toLowerCase();
  }

  changeRole(user: OpsUserDto, role: string): void {
    if (role === user.role) return;
    if (this.isSelf(user) && user.role === 'lead' && role !== 'lead') {
      this.error.set("You can't demote yourself from Lead. Ask another lead to do it.");
      // Revert the select visually by triggering a reload.
      this.reload();
      return;
    }
    const token = this.session.accessToken();
    if (!token) return;
    this.api.updateUserRole(token, user.id, role).subscribe({
      next: () => {
        this.message.set(`Role updated for ${user.email} → ${role}.`);
        this.reload();
        this.loadAudit();
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  toggleDisabled(user: OpsUserDto): void {
    if (this.isSelf(user) && !user.isDisabled) {
      this.error.set("You can't disable yourself. Sign out instead.");
      return;
    }
    const verb = user.isDisabled ? 'enable' : 'disable';
    if (
      typeof window !== 'undefined'
      && !window.confirm(`${verb[0].toUpperCase() + verb.slice(1)} ${user.email}?`)
    ) {
      return;
    }
    const token = this.session.accessToken();
    if (!token) return;
    this.api.setUserDisabled(token, user.id, !user.isDisabled).subscribe({
      next: () => {
        this.message.set(`${verb[0].toUpperCase() + verb.slice(1)}d ${user.email}.`);
        this.reload();
        this.loadAudit();
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  // ── Audit feed helpers ──────────────────────────────────────────────
  auditIcon(entry: OpsAuditEntryDto): string {
    return this.auditPresenters[entry.action]?.icon ?? 'event_note';
  }

  auditTone(entry: OpsAuditEntryDto): 'good' | 'warn' | 'bad' | 'info' {
    const t = this.auditPresenters[entry.action]?.tone ?? 'info';
    return entry.outcome === 'Failed' ? 'bad' : t;
  }

  auditDescription(entry: OpsAuditEntryDto): string {
    const presenter = this.auditPresenters[entry.action];
    if (presenter) return presenter.describe(entry);
    // Fallback: humanise the action key.
    return `${entry.actorEmail ?? 'System'} · ${entry.action.replace(/[._]/g, ' ')}`;
  }

  roleBadgeClass(role: string): string {
    switch (role.toLowerCase()) {
      case 'lead':
        return 'lead';
      case 'finance':
        return 'finance';
      case 'clerk':
        return 'clerk';
      default:
        return 'other';
    }
  }

  dismissMessage(): void { this.message.set(null); }
  dismissError(): void { this.error.set(null); }

  // ── Private ─────────────────────────────────────────────────────────
  private copyToClipboard(text: string, okMessage: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.message.set(okMessage),
        () => this.message.set(`Copy failed. Link: ${text}`),
      );
    } else {
      this.message.set(`Link: ${text}`);
    }
  }

  private fmtTarget(entry: OpsAuditEntryDto, key: string): string {
    return entry.metadata?.[key]?.toString() ?? '(unknown)';
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
