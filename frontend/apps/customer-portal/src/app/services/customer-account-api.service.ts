import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  AuthProvider,
  CustomerAccount,
  CustomerKycStatus,
  CustomerProfile,
  DeliveryAddress,
  KycDocumentInfo,
  KycDocumentSide,
  KycDocumentUploadTicket,
  OnboardingIntent,
  PickupBranch,
  DeliveryMethod,
  IdDocumentType,
  KycStatus,
  NotificationPreferences,
  SuiteAddress,
  SuiteTrial,
  UpdateProfileRequest,
  UpsertDeliveryAddressRequest,
} from '../models/customer-account.models';

interface WireCustomerAccount {
  profile: WireProfile;
  suiteAddress: WireSuiteAddress | null;
  deliveryAddresses: WireDeliveryAddress[];
  notifications: WireNotifications;
  profileComplete: boolean;
  suiteEligible: boolean;
  hasSuite: boolean;
  onboardingIntent: WireOnboardingIntent | null;
  suiteTrial: WireSuiteTrial | null;
  kycEnabled: boolean;
}

interface WireSuiteTrial {
  featureEnabled: boolean;
  durationDays: number;
  eligible: boolean;
  isActive: boolean;
  expiresAtUtc: string | null;
}

interface WireOnboardingIntent {
  kind: string;
  createdAtUtc: string;
  lastSeenAtUtc: string;
  planIdAtSignal: string | null;
  planLabelAtSignal: string | null;
}

interface WireProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  destinationCountryCode: string;
  destinationCountryLabel: string;
  idNumber: string;
  idDocumentType: string;
  preferredDeliveryMethod: string;
  kycStatus: string;
  kycRejectionReason?: string | null;
  memberSince: string;
  authProvider: string;
}

interface WireSuiteAddress {
  suiteNumber: string;
  label: string;
  recipientName: string;
  warehouseName: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  countryCode: string;
  formatted: string;
}

interface WireDeliveryAddress {
  id: string;
  branchId: string;
  branchName: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  countryCode: string;
  countryLabel: string;
  isDefault: boolean;
}

interface WirePickupBranch {
  id: string;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  description: string;
  poBox?: string | null;
  postalCode?: string;
  countryCode?: string;
  phone?: string | null;
  phoneAlt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googlePlaceId?: string | null;
}

interface WireNotifications {
  email: boolean;
  sms: boolean;
  whatsApp: boolean;
  marketing: boolean;
}

@Injectable({ providedIn: 'root' })
export class CustomerAccountApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.useBffAuth
    ? '/api/v1'
    : `${environment.platformApiUrl || ''}/api/v1`.replace(/\/$/, '') || '/api/v1';

  getAccount(): Observable<CustomerAccount> {
    return this.http
      .get<WireCustomerAccount>(`${this.base}/borderbox/account`)
      .pipe(map(mapWireAccount));
  }

  listPickupBranches(): Observable<PickupBranch[]> {
    return this.http
      .get<WirePickupBranch[]>(`${this.base}/borderbox/pickup-branches`)
      .pipe(
        map((list) =>
          list.map((b) => ({
            id: b.id,
            name: b.name,
            line1: b.line1,
            line2: b.line2,
            city: b.city,
            region: b.region,
            description: b.description,
            poBox: b.poBox ?? null,
            postalCode: b.postalCode,
            countryCode: b.countryCode,
            phone: b.phone ?? null,
            phoneAlt: b.phoneAlt ?? null,
            latitude: b.latitude ?? null,
            longitude: b.longitude ?? null,
            googlePlaceId: b.googlePlaceId ?? null,
          })),
        ),
      );
  }

  updateProfile(body: UpdateProfileRequest): Observable<CustomerAccount> {
    return this.http
      .patch<WireCustomerAccount>(`${this.base}/borderbox/account/profile`, {
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone.trim(),
        idNumber: body.idNumber.trim(),
        idDocumentType: body.idDocumentType,
        preferredDeliveryMethod: body.preferredDeliveryMethod,
      })
      .pipe(map(mapWireAccount));
  }

  updateNotifications(prefs: NotificationPreferences): Observable<CustomerAccount> {
    return this.http
      .patch<WireCustomerAccount>(`${this.base}/borderbox/account/notifications`, {
        email: prefs.email,
        sms: prefs.sms,
        whatsApp: prefs.whatsApp,
        marketing: prefs.marketing,
      })
      .pipe(map(mapWireAccount));
  }

  submitKyc(): Observable<CustomerAccount> {
    return this.http
      .post<WireCustomerAccount>(`${this.base}/borderbox/account/kyc/submit`, {})
      .pipe(map(mapWireAccount));
  }

  getKycStatus(): Observable<CustomerKycStatus> {
    return this.http.get<CustomerKycStatus>(`${this.base}/borderbox/account/kyc/status`);
  }

  createKycUploadTicket(
    side: KycDocumentSide,
    file: File,
  ): Observable<KycDocumentUploadTicket> {
    return this.http.post<KycDocumentUploadTicket>(
      `${this.base}/borderbox/account/kyc/documents/upload-ticket`,
      {
        side,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      },
    );
  }

  confirmKycUpload(
    documentId: string,
    file: File,
  ): Observable<KycDocumentInfo> {
    return this.http.post<KycDocumentInfo>(
      `${this.base}/borderbox/account/kyc/documents/${documentId}/confirm`,
      {
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      },
    );
  }

  uploadKycDocument(side: KycDocumentSide, file: File): Observable<KycDocumentInfo> {
    return this.createKycUploadTicket(side, file).pipe(
      switchMap((ticket) =>
        from(this.putKycBytes(ticket, file)).pipe(
          switchMap(() => this.confirmKycUpload(ticket.documentId, file)),
        ),
      ),
    );
  }

  private async putKycBytes(ticket: KycDocumentUploadTicket, file: File): Promise<void> {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(ticket.requiredHeaders ?? {})) {
      if (key.toLowerCase() === 'content-length') continue;
      headers[key] = value;
    }
    if (!headers['Content-Type'] && file.type) {
      headers['Content-Type'] = file.type;
    }

    const xsrf = readXsrfCookie();
    if (xsrf) {
      headers['X-XSRF-TOKEN'] = xsrf;
    }

    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: file,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Upload failed (${response.status}).`);
    }
  }

  upsertDeliveryAddress(
    id: string | null,
    body: UpsertDeliveryAddressRequest,
  ): Observable<CustomerAccount> {
    const payload = {
      branchId: body.branchId,
      label: body.label,
      fullName: body.fullName,
      phone: body.phone,
      isDefault: body.isDefault,
    };
    if (id) {
      return this.http
        .put<WireCustomerAccount>(`${this.base}/borderbox/account/delivery-addresses/${id}`, payload)
        .pipe(map(mapWireAccount));
    }
    return this.http
      .post<WireCustomerAccount>(`${this.base}/borderbox/account/delivery-addresses`, payload)
      .pipe(map(mapWireAccount));
  }

  deleteDeliveryAddress(id: string): Observable<CustomerAccount> {
    return this.http
      .delete<WireCustomerAccount>(`${this.base}/borderbox/account/delivery-addresses/${id}`)
      .pipe(map(mapWireAccount));
  }

  setDefaultDeliveryAddress(id: string): Observable<CustomerAccount> {
    return this.http
      .post<WireCustomerAccount>(
        `${this.base}/borderbox/account/delivery-addresses/${id}/default`,
        {},
      )
      .pipe(map(mapWireAccount));
  }

  markPayLaterIntent(planId?: string | null): Observable<OnboardingIntent> {
    return this.http
      .post<WireOnboardingIntent>(`${this.base}/borderbox/onboarding/pay-later`, {
        planId: planId || null,
      })
      .pipe(map(mapWireIntent));
  }

  clearPayLaterIntent(): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/borderbox/onboarding/pay-later`);
  }
}

function mapWireAccount(w: WireCustomerAccount): CustomerAccount {
  return {
    profile: mapProfile(w.profile),
    suiteAddress: w.suiteAddress ? mapSuite(w.suiteAddress) : null,
    deliveryAddresses: w.deliveryAddresses.map(mapDelivery),
    notifications: {
      email: w.notifications.email,
      sms: w.notifications.sms,
      whatsApp: w.notifications.whatsApp,
      marketing: w.notifications.marketing,
    },
    profileComplete: w.profileComplete,
    suiteEligible: w.suiteEligible,
    hasSuite: w.hasSuite,
    onboardingIntent: w.onboardingIntent ? mapWireIntent(w.onboardingIntent) : null,
    suiteTrial: w.suiteTrial ? mapWireSuiteTrial(w.suiteTrial) : null,
    kycEnabled: w.kycEnabled !== false,
  };
}

function mapWireSuiteTrial(w: WireSuiteTrial): SuiteTrial {
  return {
    featureEnabled: w.featureEnabled,
    durationDays: w.durationDays,
    eligible: w.eligible,
    isActive: w.isActive,
    expiresAtUtc: w.expiresAtUtc,
  };
}

function mapWireIntent(w: WireOnboardingIntent): OnboardingIntent {
  return {
    kind: 'pay_later',
    createdAtUtc: w.createdAtUtc,
    lastSeenAtUtc: w.lastSeenAtUtc,
    planIdAtSignal: w.planIdAtSignal ?? null,
    planLabelAtSignal: w.planLabelAtSignal ?? null,
  };
}

function mapProfile(p: WireProfile): CustomerProfile {
  return {
    userId: p.userId,
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    displayName: p.displayName,
    phone: p.phone,
    destinationCountryCode: p.destinationCountryCode,
    destinationCountryLabel: p.destinationCountryLabel,
    idNumber: p.idNumber,
    idDocumentType: (p.idDocumentType || 'NationalId') as IdDocumentType,
    preferredDeliveryMethod: 'PUDO' as DeliveryMethod,
    kycStatus: (p.kycStatus || 'NotStarted') as KycStatus,
    kycRejectionReason: p.kycRejectionReason ?? null,
    memberSince: p.memberSince,
    authProvider: (p.authProvider === 'google' ? 'google' : 'password') as AuthProvider,
  };
}

function mapSuite(s: WireSuiteAddress): SuiteAddress {
  return {
    suiteNumber: s.suiteNumber,
    label: s.label,
    recipientName: s.recipientName,
    warehouseName: s.warehouseName,
    line1: s.line1,
    line2: s.line2,
    city: s.city,
    province: s.province,
    postalCode: s.postalCode,
    country: s.country,
    countryCode: s.countryCode,
    formatted: s.formatted,
  };
}

function mapDelivery(d: WireDeliveryAddress): DeliveryAddress {
  return {
    id: d.id,
    branchId: d.branchId ?? '',
    branchName: d.branchName ?? '',
    label: d.label,
    fullName: d.fullName,
    phone: d.phone,
    line1: d.line1,
    line2: d.line2,
    city: d.city,
    region: d.region,
    countryCode: d.countryCode,
    countryLabel: d.countryLabel,
    isDefault: d.isDefault,
  };
}

function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='));
  if (!match) return null;
  return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
}
