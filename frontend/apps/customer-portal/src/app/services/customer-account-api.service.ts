import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  AuthProvider,
  CustomerAccount,
  CustomerProfile,
  DeliveryAddress,
  DeliveryMethod,
  IdDocumentType,
  KycStatus,
  NotificationPreferences,
  SuiteAddress,
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

  updateProfile(body: UpdateProfileRequest): Observable<CustomerAccount> {
    return this.http
      .patch<WireCustomerAccount>(`${this.base}/borderbox/account/profile`, body)
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

  upsertDeliveryAddress(
    id: string | null,
    body: UpsertDeliveryAddressRequest,
  ): Observable<CustomerAccount> {
    const payload = {
      label: body.label,
      fullName: body.fullName,
      phone: body.phone,
      line1: body.line1,
      line2: body.line2,
      city: body.city,
      region: body.region,
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
    preferredDeliveryMethod: (p.preferredDeliveryMethod || 'Door-to-Door') as DeliveryMethod,
    kycStatus: (p.kycStatus || 'NotStarted') as KycStatus,
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
