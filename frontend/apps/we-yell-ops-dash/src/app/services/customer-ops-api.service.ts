import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface OpsCustomerAccountListItemDto {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  destinationCountryCode: string;
  destinationCountryLabel: string;
  kycStatus: string;
  suiteNumber: string | null;
  suiteStatus: string | null;
  planName: string | null;
  suiteExpiresAtUtc: string | null;
  memberSinceUtc: string;
  isDisabled: boolean;
  riskLevel: 'Low' | 'Medium' | 'High';
  isTrial: boolean;
}

export interface SuitePaymentsOverviewDto {
  currentPlan: SuitePaymentsCurrentPlanDto | null;
  subscription: SuitePaymentsSubscriptionDto | null;
  lastPayment: SuitePaymentsLastPaymentDto | null;
  nextPayment: SuitePaymentsNextPaymentDto | null;
  paymentMethod: SuitePaymentMethodDto | null;
  history: SuitePaymentHistoryRowDto[];
  summary: SuitePaymentsSummaryDto;
}

export interface SuitePaymentsCurrentPlanDto {
  planId: string;
  planName: string;
  planLabel: string;
  durationMonths: number;
  priceZar: number;
}

export interface SuitePaymentsSubscriptionDto {
  suiteNumber: string;
  status: string;
  startedAtUtc: string | null;
  expiresAtUtc: string | null;
  daysRemaining: number | null;
  shipOutLocked: boolean;
  autoRenewEnabled: boolean;
}

export interface SuitePaymentsLastPaymentDto {
  reference: string;
  paidAtUtc: string;
  amountZar: number;
  status: string;
}

export interface SuitePaymentsNextPaymentDto {
  dueAtUtc: string;
  amountZar: number;
  daysRemaining: number;
}

export interface SuitePaymentMethodDto {
  provider: string;
  descriptor: string;
  isDefault: boolean;
}

export interface SuitePaymentHistoryRowDto {
  reference: string;
  invoiceNumber: string;
  createdAtUtc: string;
  completedAtUtc: string | null;
  planName: string;
  planDurationMonths: number;
  amountZar: number;
  status: string;
}

export interface SuitePaymentsSummaryDto {
  totalInvoices: number;
  paid: number;
  failed: number;
  totalPaidZar: number;
}

export interface OpsCustomerAccountPageDto {
  items: OpsCustomerAccountListItemDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface CustomerProfileDto {
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

export interface SuiteAddressDto {
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

export interface DeliveryAddressDto {
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

export interface NotificationPreferencesDto {
  email: boolean;
  sms: boolean;
  whatsApp: boolean;
  marketing: boolean;
}

export interface CustomerAccountResponse {
  profile: CustomerProfileDto;
  suiteAddress: SuiteAddressDto | null;
  deliveryAddresses: DeliveryAddressDto[];
  notifications: NotificationPreferencesDto;
  profileComplete: boolean;
  suiteEligible: boolean;
  hasSuite: boolean;
}

export interface OpsSuiteSubscriptionDto {
  subscriptionId: string;
  planId: string;
  planName: string;
  planDurationMonths: number;
  planPriceZar: number;
  suiteNumber: string;
  status: string;
  startedAtUtc: string | null;
  expiresAtUtc: string | null;
  shipOutLocked: boolean;
  isTrial: boolean;
}

export interface OpsCustomerAccountDetailDto {
  account: CustomerAccountResponse;
  subscription: OpsSuiteSubscriptionDto | null;
  isDisabled: boolean;
  lastLoginUtc: string | null;
  kycSubmittedAtUtc: string | null;
  receivedParcelCount: number;
}

export interface SuitePlanDto {
  id: string;
  name: string;
  durationMonths: number;
  priceZar: number;
  isRecommended: boolean;
}

export interface CustomerAddressActivityItemDto {
  id: string;
  icon: string;
  title: string;
  subtitle: string | null;
  dateUtc: string;
  status: string;
  statusTone: string;
}

export interface DeletedAccountCountsDto {
  parcels: number;
  shipments: number;
  quotes: number;
  invoices: number;
  notifications: number;
  supportTickets: number;
  addresses: number;
  suiteSubscriptions: number;
  paymentRecords: number;
  kycSubmissions: number;
  trackingEvents: number;
  warehouseMovements: number;
  otherDependents: number;
}

export interface UpdateCustomerSuiteNumberResultDto {
  userId: string;
  previousSuiteNumber: string;
  newSuiteNumber: string;
}

export interface DeleteCustomerAccountResultDto {
  userId: string;
  email: string;
  displayName: string;
  deletedAtUtc: string;
  userDeleted: boolean;
  totalDependents: number;
  counts: DeletedAccountCountsDto;
}

@Injectable({ providedIn: 'root' })
export class CustomerOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/accounts`;

  list(params?: {
    search?: string;
    kycStatus?: string;
    country?: string;
    suiteStatus?: string;
    page?: number;
    pageSize?: number;
  }): Observable<OpsCustomerAccountPageDto> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.kycStatus) q.set('kycStatus', params.kycStatus);
    if (params?.country) q.set('country', params.country);
    if (params?.suiteStatus) q.set('suiteStatus', params.suiteStatus);
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    const suffix = q.toString() ? `?${q}` : '';
    return this.http.get<OpsCustomerAccountPageDto>(`${this.base}${suffix}`, {
      headers: buildOpsHeaders(),
    });
  }

  get(userId: string): Observable<OpsCustomerAccountDetailDto> {
    return this.http.get<OpsCustomerAccountDetailDto>(`${this.base}/${userId}`, {
      headers: buildOpsHeaders(),
    });
  }

  getSuitePayments(userId: string): Observable<SuitePaymentsOverviewDto> {
    return this.http.get<SuitePaymentsOverviewDto>(
      `${this.base}/${userId}/suite-payments`,
      { headers: buildOpsHeaders() },
    );
  }

  listSuitePlans(): Observable<SuitePlanDto[]> {
    return this.http.get<SuitePlanDto[]>(`${this.base}/suite-plans`, {
      headers: buildOpsHeaders(),
    });
  }

  getAddressActivity(userId: string, limit = 20): Observable<CustomerAddressActivityItemDto[]> {
    return this.http.get<CustomerAddressActivityItemDto[]>(
      `${this.base}/${userId}/address-activity?limit=${limit}`,
      { headers: buildOpsHeaders() },
    );
  }

  updateSuiteNumber(
    userId: string,
    body: { newSuiteNumber?: string | null; regenerateFromPool: boolean },
  ): Observable<UpdateCustomerSuiteNumberResultDto> {
    return this.http.post<UpdateCustomerSuiteNumberResultDto>(
      `${this.base}/${userId}/suite-number`,
      body,
      { headers: buildOpsHeaders() },
    );
  }

  /**
   * Hard-delete a customer and every row they own. `confirmEmail` must
   * exactly match (case-insensitive) the customer's account email — the
   * backend enforces this as a guardrail.
   */
  deleteAccount(
    userId: string,
    confirmEmail: string,
  ): Observable<DeleteCustomerAccountResultDto> {
    const q = new URLSearchParams({ confirmEmail });
    return this.http.delete<DeleteCustomerAccountResultDto>(
      `${this.base}/${userId}?${q}`,
      { headers: buildOpsHeaders() },
    );
  }
}
