import { Injectable, inject } from '@angular/core';
import { AccountSessionService } from './account-session.service';
import { WayelMyParentService } from './wayel-my-parent.service';

/**
 * Bridges the gap between an authenticated account (auth surface knows
 * `userId`, `email`, `role`) and the parent identity surface (which
 * owns `parentId`, the canonical id for children / subscriptions /
 * lifetime archives).
 *
 * The auth response (`/api/v1/auth/login`, `/auth/register`,
 * `/auth/me`, and the BFF `/me` projection) intentionally doesn't
 * return a `parentId` because not every account is a parent. So the
 * SPA has to *ask* `/api/v1/me/parent` whether the signed-in account
 * resolves to a parent, and patch the locally-cached account with the
 * id when it does.
 *
 * Without this hydration, `parent-subscribe` and `parent-subscriptions`
 * fall back to mock data because they look up `account.parentId` to
 * scope their API calls.
 *
 * Errors are swallowed deliberately: a failed parent lookup must not
 * break the user's sign-in. The Subscribe/Subscriptions screens will
 * still surface their own "couldn't load" state if the user navigates
 * there before the hydration retries land.
 */
@Injectable({ providedIn: 'root' })
export class ParentSessionHydratorService {
  private readonly session = inject(AccountSessionService);
  private readonly myParent = inject(WayelMyParentService);

  /**
   * If the currently-signed-in account looks like a parent but has no
   * `parentId`, fetch `/api/v1/me/parent` and patch it onto the cached
   * account. No-op for non-parent accounts and for accounts that
   * already carry a `parentId`.
   */
  async hydrateIfParent(): Promise<void> {
    const account = this.session.currentAccount();
    if (!account) return;
    if (account.role !== 'parent') return;
    if (account.parentId) return;

    try {
      const me = await this.myParent.get();
      if (!me?.parentId) return;
      // Re-read the session in case it changed under us mid-flight (e.g.
      // user logged out before the response landed).
      const fresh = this.session.currentAccount();
      if (!fresh || fresh.id !== account.id) return;
      this.session.patchAccount({ ...fresh, parentId: me.parentId });
    } catch {
      // Intentional swallow — see service docstring.
    }
  }
}
