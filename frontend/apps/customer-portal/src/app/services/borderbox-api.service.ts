import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SuiteAccessSummary {
  status: string;
  canReceiveParcels: boolean;
  canUploadInvoices: boolean;
  canShipOut: boolean;
  shipOutLocked: boolean;
  customerMessage: string;
  suiteNumber: string | null;
  expiresAt: string | null;
}

export interface DashboardDto {
  suiteAccess: SuiteAccessSummary;
  parcelCount: number;
  suiteNumber: string | null;
}

export interface SuitePlanDto {
  id: string;
  name: string;
  durationMonths: number;
  priceZar: number;
  isRecommended: boolean;
}

export interface InitiateSuiteCheckoutDto {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amountZar: number;
  provider: string;
  publicKey: string | null;
}

export interface PaymentProviderOptionDto {
  provider: string;
  displayName: string;
  isConfigured: boolean;
  isRecommended: boolean;
}

export interface PaymentStatusDto {
  reference: string;
  provider: string;
  /** "success" | "pending" | "failed" */
  status: string;
  amountMinorUnits: number;
  currency: string;
}

export interface MomoMsisdnValidationDto {
  isValid: boolean;
  /** Digits-only MSISDN that MTN was queried with (no leading +). */
  msisdn: string;
  reason: string | null;
}

export interface SuitePaymentsOverviewDto {
  currentPlan: SuitePaymentsCurrentPlanDto | null;
  subscription: SuitePaymentsSubscriptionDto | null;
  lastPayment: SuitePaymentsLastPaymentDto | null;
  nextPayment: SuitePaymentsNextPaymentDto | null;
  /** Default card for quick display (legacy field). */
  paymentMethod: SuitePaymentMethodDto | null;
  paymentMethods: SuitePaymentMethodDto[];
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
  id: string;
  provider: string;
  descriptor: string;
  cardType: string;
  last4: string;
  expMonth: string;
  expYear: string;
  label: string | null;
  isDefault: boolean;
}

export interface CustomerSavedCardDto {
  id: string;
  provider: string;
  cardType: string;
  last4: string;
  expMonth: string;
  expYear: string;
  bank: string | null;
  label: string | null;
  isDefault: boolean;
  displayName: string;
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

export interface ParcelDto {
  id: string;
  retailer: string;
  trackingNumber: string | null;
  itemName: string;
  category: string;
  status: string;
  weightKg: number | null;
  declaredValueZar: number | null;
  dimensionsLabel?: string | null;
  receivedAtUtc: string;
  invoiceStatus: string;
  invoiceFileName: string | null;
  invoiceUploadedAtUtc?: string | null;
  quoteState?: string;
  quoteStateLabel?: string;
  openQuoteId?: string | null;
  openQuoteDisplayNumber?: string | null;
  shipmentId?: string | null;
  canRequestQuote?: boolean;
  quoteRequestBlocker?: string | null;
}

export interface ParcelPhotoDto {
  id: string;
  url: string;
  caption: string | null;
  capturedAtUtc: string | null;
}

export interface ParcelDetailDto extends ParcelDto {
  suiteNumber: string;
  dimensionsLabel: string | null;
  daysInWarehouse: number;
  invoiceFileSizeBytes: number | null;
  canUploadInvoice: boolean;
  invoiceDownloadUrl?: string | null;
  photos?: ParcelPhotoDto[];
}

export interface UploadParcelInvoiceResultDto {
  parcelId: string;
  invoiceStatus: string;
  fileName: string;
  uploadedAtUtc: string;
  downloadUrl?: string | null;
}

export interface ShipmentDto {
  id: string;
  quoteId: string;
  status: string;
  shipOutLockedReason: string | null;
}

export interface QuoteSummaryDto {
  id: string;
  displayNumber: string;
  totalLandedCost: number;
  status: string;
  statusLabel: string;
  createdAtUtc: string;
  validUntil: string;
  parcelCount: number;
  deliveryMethod: string;
  shipOutLocked: boolean;
  hasPaymentInvoice: boolean;
  paymentPaidAtUtc: string | null;
  paymentReference: string | null;
}

export interface QuoteBreakdownLineDto {
  label: string;
  amount: number;
  /** When false, shown for reference only — not part of total to pay. */
  includedInTotal?: boolean;
}

export interface QuoteLinkedParcelDto {
  parcelId: string;
  reference: string;
  itemName: string;
  retailer: string;
  declaredValueZar: number;
  weightKg: number | null;
  dimensionsLabel: string | null;
}

export interface QuoteDetailDto {
  id: string;
  displayNumber: string;
  shipmentId: string | null;
  createdAtUtc: string;
  publishedAtUtc: string | null;
  validUntil: string;
  shipTo: string;
  deliveryEstimate: string;
  totalLandedCost: number;
  declaredGoodsValueZar: number;
  vatCharged: boolean;
  dutyCharged: boolean;
  dutyGoodsValueThresholdZar: number;
  parcelCount: number;
  totalWeightKg: number;
  deliveryMethod: string;
  consolidation: string;
  warehouse: string;
  status: string;
  statusLabel: string;
  statusReason: string | null;
  shipOutLocked: boolean;
  canApprove: boolean;
  canPay: boolean;
  canCancel: boolean;
  hasPaymentInvoice: boolean;
  breakdown: QuoteBreakdownLineDto[];
  linkedParcels: QuoteLinkedParcelDto[];
}

export interface InitiateQuoteCheckoutDto {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amountZar: number;
  provider: string;
  publicKey: string | null;
}

export interface CreateQuoteRequestResultDto {
  quoteId: string;
  displayNumber: string;
  status: string;
  totalLandedCost: number;
  validUntil: string;
  parcelCount: number;
}

export interface QuoteApprovalDto {
  id: string;
  shipmentId: string | null;
  totalLandedCost: number;
  status: string;
  statusReason: string | null;
}

export interface ParcelQuoteHistoryItemDto {
  quoteId: string;
  displayNumber: string;
  statusLabel: string;
  totalLandedCost: number;
  validUntil: string;
  isOpen: boolean;
}

/**
 * WeYell API facade. Calls the live `/api/v1/borderbox/*` endpoints — no
 * mock fallback is wired.
 */
@Injectable({ providedIn: 'root' })
export class BorderboxApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.useBffAuth
    ? '/api/v1'
    : `${environment.platformApiUrl || ''}/api/v1`.replace(/\/$/, '') || '/api/v1';

  getDashboard(): Observable<DashboardDto> {
    return this.http.get<DashboardDto>(`${this.base}/borderbox/dashboard`);
  }

  listParcels(): Observable<ParcelDto[]> {
    return this.http.get<ParcelDto[]>(`${this.base}/borderbox/parcels`);
  }

  getParcel(id: string): Observable<ParcelDetailDto> {
    return this.http.get<ParcelDetailDto>(`${this.base}/borderbox/parcels/${id}`);
  }

  updateParcelPhysical(
    parcelId: string,
    body: { weightKg: number | null; dimensionsLabel: string | null; declaredValueZar: number | null },
  ): Observable<ParcelDetailDto> {
    return this.http.patch<ParcelDetailDto>(
      `${this.base}/borderbox/parcels/${parcelId}/physical`,
      body,
    );
  }

  uploadParcelInvoice(parcelId: string, file: File): Observable<UploadParcelInvoiceResultDto> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<UploadParcelInvoiceResultDto>(
      `${this.base}/borderbox/parcels/${parcelId}/invoice`,
      form,
    );
  }

  invoiceDownloadUrl(parcelId: string): string {
    return `${this.base}/borderbox/parcels/${parcelId}/invoice/download`;
  }

  downloadInvoiceBlob(parcelId: string): Observable<Blob> {
    return this.http.get(`${this.base}/borderbox/parcels/${parcelId}/invoice/download`, {
      responseType: 'blob',
      withCredentials: true,
    });
  }

  listSuitePlans(): Observable<SuitePlanDto[]> {
    return this.http.get<SuitePlanDto[]>(`${this.base}/borderbox/suite-plans`);
  }

  getSuitePaymentsOverview(): Observable<SuitePaymentsOverviewDto> {
    return this.http.get<SuitePaymentsOverviewDto>(
      `${this.base}/borderbox/account/suite-payments`,
    );
  }

  activateSuite(planId: string): Observable<unknown> {
    return this.http.post(`${this.base}/borderbox/suite-access/checkout`, { planId });
  }

  initiateSuiteCheckout(
    planId: string,
    callbackUrl: string,
    options?: { provider?: string; payerMsisdn?: string },
  ): Observable<InitiateSuiteCheckoutDto> {
    return this.http.post<InitiateSuiteCheckoutDto>(
      `${this.base}/borderbox/suite-access/checkout/initiate`,
      {
        planId,
        callbackUrl,
        provider: options?.provider ?? null,
        payerMsisdn: options?.payerMsisdn ?? null,
      },
    );
  }

  completeSuiteCheckout(reference: string): Observable<unknown> {
    return this.http.post(`${this.base}/borderbox/suite-access/checkout/complete`, {
      reference,
    });
  }

  listPaymentMethods(): Observable<CustomerSavedCardDto[]> {
    return this.http.get<CustomerSavedCardDto[]>(`${this.base}/borderbox/payment-methods`);
  }

  initiateAddPaymentMethod(
    callbackUrl: string,
    label?: string | null,
  ): Observable<InitiateSuiteCheckoutDto> {
    return this.http.post<InitiateSuiteCheckoutDto>(
      `${this.base}/borderbox/payment-methods/initiate`,
      { callbackUrl, label: label ?? null },
    );
  }

  completeAddPaymentMethod(
    reference: string,
    label?: string | null,
  ): Observable<CustomerSavedCardDto> {
    return this.http.post<CustomerSavedCardDto>(
      `${this.base}/borderbox/payment-methods/complete`,
      { reference, label: label ?? null },
    );
  }

  setDefaultPaymentMethod(cardId: string): Observable<CustomerSavedCardDto> {
    return this.http.post<CustomerSavedCardDto>(
      `${this.base}/borderbox/payment-methods/${cardId}/default`,
      {},
    );
  }

  updatePaymentMethodLabel(cardId: string, label: string | null): Observable<CustomerSavedCardDto> {
    return this.http.patch<CustomerSavedCardDto>(
      `${this.base}/borderbox/payment-methods/${cardId}`,
      { label },
    );
  }

  removePaymentMethod(cardId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/borderbox/payment-methods/${cardId}`);
  }

  listPaymentProviders(msisdn?: string): Observable<PaymentProviderOptionDto[]> {
    const params: Record<string, string> = {};
    if (msisdn) params['msisdn'] = msisdn;
    return this.http.get<PaymentProviderOptionDto[]>(
      `${this.base}/borderbox/payments/providers`,
      { params },
    );
  }

  getPaymentStatus(reference: string): Observable<PaymentStatusDto> {
    return this.http.get<PaymentStatusDto>(
      `${this.base}/borderbox/payments/${encodeURIComponent(reference)}/status`,
    );
  }

  validateMomoMsisdn(msisdn: string): Observable<MomoMsisdnValidationDto> {
    return this.http.post<MomoMsisdnValidationDto>(
      `${this.base}/borderbox/payments/momo/validate`,
      { msisdn },
    );
  }

  seedShippableTestParcels(dataset: 'catalog-a' | 'catalog-b' = 'catalog-a'): Observable<{
    created: number;
    totalShippable: number;
    dataset: string;
    message: string;
  }> {
    return this.http.post<{
      created: number;
      totalShippable: number;
      dataset: string;
      message: string;
    }>(`${this.base}/borderbox/dev/seed-shippable-parcels`, { dataset });
  }

  estimateShipmentQuote(
    parcelIds: string[],
    deliveryMethod: string,
  ): Observable<{
    totalLandedCost: number;
    declaredGoodsValueZar: number;
    vatCharged: boolean;
    dutyCharged: boolean;
    dutyGoodsValueThresholdZar: number;
    totalWeightKg: number;
    parcelCount: number;
    deliveryEstimate: string;
    breakdown: QuoteBreakdownLineDto[];
  }> {
    return this.http.post<{
      totalLandedCost: number;
      declaredGoodsValueZar: number;
      vatCharged: boolean;
      dutyCharged: boolean;
      dutyGoodsValueThresholdZar: number;
      totalWeightKg: number;
      parcelCount: number;
      deliveryEstimate: string;
      breakdown: QuoteBreakdownLineDto[];
    }>(`${this.base}/borderbox/shipments/estimate`, {
      parcelIds,
      deliveryMethod,
    });
  }

  createShipment(parcelIds: string[], deliveryMethod: string): Observable<ShipmentDto> {
    return this.http.post<ShipmentDto>(`${this.base}/borderbox/shipments`, {
      parcelIds,
      deliveryMethod,
    });
  }

  createQuoteRequest(
    parcelIds: string[],
    deliveryMethod: string,
  ): Observable<CreateQuoteRequestResultDto> {
    return this.http.post<CreateQuoteRequestResultDto>(
      `${this.base}/borderbox/quotes/requests`,
      { parcelIds, deliveryMethod },
    );
  }

  listQuotes(status?: string): Observable<QuoteSummaryDto[]> {
    const params = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.http.get<QuoteSummaryDto[]>(`${this.base}/borderbox/quotes${params}`);
  }

  getParcelQuoteHistory(parcelId: string): Observable<ParcelQuoteHistoryItemDto[]> {
    return this.http.get<ParcelQuoteHistoryItemDto[]>(
      `${this.base}/borderbox/parcels/${parcelId}/quotes`,
    );
  }

  getQuote(id: string): Observable<QuoteDetailDto> {
    return this.http.get<QuoteDetailDto>(`${this.base}/borderbox/quotes/${id}`);
  }

  approveQuote(id: string): Observable<QuoteApprovalDto> {
    return this.http.post<QuoteApprovalDto>(`${this.base}/borderbox/quotes/${id}/approve`, {});
  }

  cancelQuote(id: string): Observable<QuoteApprovalDto> {
    return this.http.post<QuoteApprovalDto>(`${this.base}/borderbox/quotes/${id}/cancel`, {});
  }

  initiateQuoteCheckout(
    quoteId: string,
    callbackUrl: string,
    options?: { provider?: string; payerMsisdn?: string },
  ): Observable<InitiateQuoteCheckoutDto> {
    return this.http.post<InitiateQuoteCheckoutDto>(
      `${this.base}/borderbox/quotes/${quoteId}/checkout/initiate`,
      {
        callbackUrl,
        provider: options?.provider ?? null,
        payerMsisdn: options?.payerMsisdn ?? null,
      },
    );
  }

  completeQuoteCheckout(reference: string): Observable<QuoteApprovalDto> {
    return this.http.post<QuoteApprovalDto>(`${this.base}/borderbox/quotes/checkout/complete`, {
      reference,
    });
  }

  quotePaymentInvoiceDownloadUrl(quoteId: string, download = false): string {
    const q = download ? '?download' : '';
    return `${this.base}/borderbox/quotes/${quoteId}/payment-invoice/download${q}`;
  }

  suitePaymentInvoiceDownloadUrl(reference: string, download = false): string {
    const q = download ? '?download' : '';
    return `${this.base}/borderbox/account/suite-payments/${encodeURIComponent(
      reference,
    )}/invoice/download${q}`;
  }

  getTrackingSupport(): Observable<TrackingSupportOverviewDto> {
    return this.http.get<TrackingSupportOverviewDto>(`${this.base}/borderbox/tracking-support`);
  }

  getShipmentTracking(shipmentId: string): Observable<ShipmentTrackingDetailDto> {
    return this.http.get<ShipmentTrackingDetailDto>(
      `${this.base}/borderbox/shipments/${shipmentId}/tracking`,
    );
  }

  getParcelShipmentTracking(parcelId: string): Observable<ShipmentTrackingDetailDto> {
    return this.http.get<ShipmentTrackingDetailDto>(
      `${this.base}/borderbox/parcels/${parcelId}/tracking`,
    );
  }

  createSupportTicket(subject: string, body: string): Observable<SupportTicketSummaryDto> {
    return this.http.post<SupportTicketSummaryDto>(`${this.base}/borderbox/support/tickets`, {
      subject,
      body,
    });
  }
}

export interface TrackingTimelineStepDto {
  label: string;
  done: boolean;
  current: boolean;
  occurredAtUtc: string | null;
}

export interface ShipmentTrackingDto {
  shipmentId: string;
  reference: string;
  status: string;
  statusLabel: string;
  primaryTrackingNumber: string | null;
  from: string;
  to: string;
  service: string;
  weightLabel: string;
  pieceCount: number;
  estimatedDelivery: string | null;
  timeline: TrackingTimelineStepDto[];
}

export interface SupportTicketSummaryDto {
  id: string;
  displayId: string;
  subject: string;
  snippet: string;
  status: string;
  createdAtUtc: string;
}

export interface SupportContactDto {
  whatsAppLink: string | null;
  whatsAppDisplay: string | null;
  emailAddress: string | null;
}

export interface TrackingSupportOverviewDto {
  activeShipmentId: string | null;
  recentTicket: SupportTicketSummaryDto | null;
  notifications: { email: boolean; sms: boolean; whatsApp: boolean };
  support: SupportContactDto;
}

export interface ShipmentTrackingMilestoneDto {
  label: string;
  icon: string;
  done: boolean;
  current: boolean;
  occurredAtUtc: string | null;
}

export interface ShipmentTrackingParcelRowDto {
  trackingNumber: string;
  itemName: string;
  weightKg: number | null;
  status: string;
  statusLabel: string;
}

export interface ShipmentTrackingHistoryEventDto {
  occurredAtUtc: string;
  eventLabel: string;
  eventTone: string;
  location: string;
  details: string;
}

export interface CourierInfoDto {
  name: string;
  website: string;
  phone: string;
}

export interface RecipientInfoDto {
  name: string;
  phone: string;
  address: string;
}

export interface ShipmentTrackingDetailDto {
  shipmentId: string;
  trackingNumber: string;
  status: string;
  statusLabel: string;
  deliveryMethod: string;
  estimatedDelivery: string;
  originLabel: string;
  destinationLabel: string;
  parcelCount: number;
  totalWeightLabel: string;
  declaredValueLabel: string;
  milestones: ShipmentTrackingMilestoneDto[];
  parcels: ShipmentTrackingParcelRowDto[];
  courier: CourierInfoDto;
  recipient: RecipientInfoDto;
  history: ShipmentTrackingHistoryEventDto[];
  timezoneNote: string;
}
