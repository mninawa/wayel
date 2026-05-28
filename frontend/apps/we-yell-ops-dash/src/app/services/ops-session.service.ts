import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, tap } from 'rxjs';
import { getStoredOpsKey } from './ops-api-key';
import {
  clearStoredOpsAuth,
  getStoredOpsExpiresAtUtc,
  getStoredOpsToken,
  getStoredOpsUser,
  isOpsAccessTokenExpired,
  purgeExpiredOpsAuth,
  storeOpsAuth,
  type StoredOpsUser,
} from './ops-auth-storage';
import { OpsAuthService, type OpsAuthSessionDto } from './ops-auth.service';
import {
  defaultHomePath,
  normalizeOpsRegions,
  regionsForRole,
  type OpsRegion,
} from './ops-regions';
import { ReceivingApiService, type OpsAccessDto } from './receiving-api.service';

@Injectable({ providedIn: 'root' })
export class OpsSessionService {
  private readonly authApi = inject(OpsAuthService);
  private readonly receivingApi = inject(ReceivingApiService);

  private readonly token = signal<string | null>(this.loadInitialToken());
  private readonly user = signal<StoredOpsUser | null>(getStoredOpsUser());
  private readonly access = signal<OpsAccessDto | null>(null);

  readonly isConnected = computed(() => {
    const t = this.token();
    return !!t?.trim() && !isOpsAccessTokenExpired(t, getStoredOpsExpiresAtUtc());
  });
  readonly role = computed(() => this.access()?.role ?? this.user()?.role ?? '');
  readonly capabilities = computed(() => this.access()?.capabilities ?? []);
  readonly regions = computed<OpsRegion[]>(() => {
    const fromAccess = this.access()?.regions;
    if (fromAccess?.length) {
      return normalizeOpsRegions(fromAccess);
    }
    const fromUser = this.user()?.regions;
    if (fromUser?.length) {
      return normalizeOpsRegions(fromUser);
    }
    return regionsForRole(this.role());
  });
  readonly actorName = computed(
    () => this.access()?.actor ?? this.user()?.displayName ?? 'Ops User',
  );
  readonly email = computed(() => this.user()?.email ?? '');

  accessToken(): string | null {
    return this.token();
  }

  /** Credential for API calls — Bearer token preferred, legacy API key fallback. */
  opsKey(): string | null {
    const bearer = getStoredOpsToken();
    if (bearer) {
      return bearer;
    }
    return getStoredOpsKey();
  }

  applySession(session: OpsAuthSessionDto): void {
    const regions = normalizeOpsRegions(session.regions ?? session.user.regions);
    const user: StoredOpsUser = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      role: session.user.role,
      regions,
    };
    storeOpsAuth(session.accessToken, user, session.expiresAtUtc);
    this.token.set(session.accessToken);
    this.user.set(user);
    this.access.set({
      role: session.user.role,
      actor: session.user.displayName,
      capabilities: session.capabilities,
      regions,
    });
  }

  signInWithGoogle(idToken: string): Observable<OpsAuthSessionDto> {
    return this.authApi.signInWithGoogle(idToken).pipe(
      tap((session) => this.applySession(session)),
    );
  }

  refreshAccess(): Observable<OpsAccessDto | null> {
    const token = this.token();
    if (!token) {
      this.access.set(null);
      return EMPTY;
    }
    return this.receivingApi.getAccess(token).pipe(tap((a) => this.access.set(a)));
  }

  can(permission: string): boolean {
    return this.capabilities().includes(permission);
  }

  hasRegion(region: OpsRegion): boolean {
    return this.regions().includes(region);
  }

  homePath(): string {
    return defaultHomePath(this.regions());
  }

  disconnect(): void {
    clearStoredOpsAuth();
    this.token.set(null);
    this.user.set(null);
    this.access.set(null);
  }

  private loadInitialToken(): string | null {
    purgeExpiredOpsAuth();
    return getStoredOpsToken();
  }
}
