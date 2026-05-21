import { Injectable, inject } from '@angular/core';
import { Observable, delay, of, tap } from 'rxjs';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import type { Phase0AuthResponse } from '@wayel/shared/core/contracts/accounts.phase0';
import {
  assignMockSuite,
  getMockCustomerAccount,
  provisionFullDemoUser,
} from '../data/customer-account.mock';
import {
  MOCK_DASHBOARD_STATS,
  MOCK_PARCELS,
  MOCK_QUOTE,
  MOCK_SUITE,
} from '../data/borderbox-mock.data';
import type {
  DashboardDto,
  ParcelDto,
  SuitePlanDto,
} from './borderbox-api.service';

/** Demo credentials — also registered in shared `MOCK_ACCOUNTS`. */
export const DEMO_EMAIL = 'sabelo@weyell.demo';
export const DEMO_PASSWORD = 'demo1234';

function demoAuth(): Phase0AuthResponse {
  const p = provisionFullDemoUser().profile;
  return {
    account: {
      id: p.userId,
      role: 'parent',
      email: p.email,
      displayName: p.displayName,
      phone: p.phone,
      createdAt: '2025-06-01T08:00:00Z',
      parentId: 'parent_sabelo',
    },
    sessionToken: 'sess_weyell_demo',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

const DEMO_DASHBOARD: DashboardDto = {
  suiteNumber: MOCK_SUITE.number,
  parcelCount: MOCK_PARCELS.length,
  suiteAccess: {
    status: MOCK_SUITE.status,
    canReceiveParcels: true,
    canUploadInvoices: true,
    canShipOut: !MOCK_SUITE.shipOutLocked,
    shipOutLocked: MOCK_SUITE.shipOutLocked,
    customerMessage: 'Suite reserved. Ship-out locked until renewal.',
    suiteNumber: MOCK_SUITE.number,
    expiresAt: '2026-08-20T00:00:00Z',
  },
};

const DEMO_PARCELS: ParcelDto[] = MOCK_PARCELS.map((p) => ({
  id: p.id,
  retailer: p.retailer,
  trackingNumber: p.tracking,
  status: p.status,
  weightKg: parseFloat(p.weight) || null,
  receivedAtUtc: isoFromDisplayDate(p.receivedOn),
}));

const DEMO_PLANS: SuitePlanDto[] = [
  {
    id: 'plan_monthly',
    name: 'Monthly Suite Access',
    durationMonths: 1,
    priceZar: 100,
    isRecommended: false,
  },
  {
    id: 'plan_quarterly',
    name: 'Quarterly Suite Access',
    durationMonths: 3,
    priceZar: 200,
    isRecommended: true,
  },
];

function isoFromDisplayDate(d: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const m = d.match(/(\d+)\s+(\w+)\s+(\d+)/);
  if (!m) return '2026-05-19T10:00:00Z';
  const mon = months[m[2]] ?? '05';
  return `${m[3]}-${mon}-${m[1].padStart(2, '0')}T10:00:00Z`;
}

@Injectable({ providedIn: 'root' })
export class BorderboxMockService {
  private readonly session = inject(AccountSessionService);

  /** One-click demo sign-in (no HTTP) — full profile + suite. */
  signInAsDemo(): void {
    provisionFullDemoUser();
    this.session.setSession(demoAuth());
  }

  isDemoSignedIn(): boolean {
    return this.session.currentAccount()?.email === DEMO_EMAIL;
  }

  getDashboard(): Observable<DashboardDto> {
    return of({ ...DEMO_DASHBOARD }).pipe(delay(120));
  }

  listParcels(): Observable<ParcelDto[]> {
    return of([...DEMO_PARCELS]).pipe(delay(120));
  }

  getParcel(id: string) {
    return MOCK_PARCELS.find((p) => p.id === id) ?? MOCK_PARCELS[0];
  }

  listSuitePlans(): Observable<SuitePlanDto[]> {
    return of([...DEMO_PLANS]).pipe(delay(80));
  }

  activateSuite(planId: string): Observable<{ ok: boolean; planId: string }> {
    return of({ ok: true as const, planId }).pipe(
      delay(600),
      tap(() => {
        assignMockSuite();
        MOCK_SUITE.status = 'Active';
        MOCK_SUITE.shipOutLocked = false;
        DEMO_DASHBOARD.suiteAccess = {
          ...DEMO_DASHBOARD.suiteAccess,
          status: 'Active',
          canShipOut: true,
          shipOutLocked: false,
          customerMessage: 'Suite access active.',
        };
      }),
    );
  }

  readonly suite = MOCK_SUITE;
  readonly parcels = MOCK_PARCELS;
  readonly stats = MOCK_DASHBOARD_STATS;
  readonly quote = MOCK_QUOTE;

  parcelSummary() {
    const uploaded = MOCK_PARCELS.filter((p) => p.invoice === 'uploaded').length;
    const pending = MOCK_PARCELS.filter((p) => p.invoice === 'pending').length;
    const ready = MOCK_PARCELS.filter((p) => p.status === 'Ready to Ship').length;
    return {
      total: MOCK_PARCELS.length,
      uploaded,
      pending,
      ready,
      inTransit: 0,
      delivered: 0,
    };
  }
}
