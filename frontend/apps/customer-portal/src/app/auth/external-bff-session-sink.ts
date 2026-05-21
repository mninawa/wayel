import { Injectable, inject } from '@angular/core';
import {
  BffSessionSink,
  type BffMeResponse,
} from '@wayel/shared/services/bff-auth.service';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { ParentSessionHydratorService } from '@wayel/shared/services/parent-session-hydrator.service';
import type { Phase0Account } from '@wayel/shared/core/contracts/accounts.phase0';

/**
 * customer-portal's projection of `/bff/auth/me` into the local session model.
 *
 * The shared `BffAuthService` defaults to writing a `PlatformSessionUser` into
 * `PlatformSessionService` (used by REMOVED / client-portal). customer-portal
 * already had a long-lived parent/staff session model based on `Phase0Account`
 * stored in `AccountSessionService` — its shells, guards, and route resolution
 * (`homeRouteForRole()`) all read from there.
 *
 * Rather than fork the shells, we mirror the BFF identity into the same store.
 * The session token field is set to a sentinel string because actual API auth
 * goes through the BFF cookie + access-token interceptor, not the bearer
 * stored in `AccountSessionService` — but `accountAuthInterceptor` will still
 * attach it to outbound calls, which is harmless for same-origin BFF traffic.
 */
@Injectable({ providedIn: 'root' })
export class ExternalBffSessionSink implements BffSessionSink {
  private readonly session = inject(AccountSessionService);
  private readonly parentHydrator = inject(ParentSessionHydratorService);

  apply(me: BffMeResponse): void {
    const account: Phase0Account = {
      id: me.userId,
      role: mapBffRoleToPhase0(me.role),
      email: me.email,
      displayName: me.displayName,
      phone: null,
      createdAt: new Date().toISOString(),
    };
    this.session.setSession({
      account,
      sessionToken: 'bff-cookie',
      expiresAt: me.accessTokenExpiresOnUtc,
    });
    // BFF /me carries identity but no parent id — the SPA needs it for the
    // subscribe / subscriptions flows. See ParentSessionHydratorService.
    void this.parentHydrator.hydrateIfParent();
  }

  clear(): void {
    this.session.clear();
  }
}

/**
 * Map the .NET `UserRole` enum (sent as a string by the BFF /me endpoint)
 * into the parent/staff dichotomy customer-portal uses for navigation. Anyone
 * who isn't a parent (TenantAdmin, Staff, SuperAdmin, …) lands in the staff
 * surface, which matches the open admission policy — customer-portal today is
 * a parent app, but a staff account that signs in still needs to land on
 * something sensible.
 */
function mapBffRoleToPhase0(role: string): 'parent' | 'staff' {
  const r = (role ?? '').toLowerCase();
  if (r === 'parent' || r === 'customer') return 'parent';
  return 'staff';
}
