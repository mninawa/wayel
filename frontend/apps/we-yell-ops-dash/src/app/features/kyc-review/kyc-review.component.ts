import { DatePipe, LowerCasePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { RouterLink } from '@angular/router';
import {
  CustomerOpsApiService,
  type OpsCustomerAccountListItemDto,
} from '../../services/customer-ops-api.service';
import {
  KycOpsApiService,
  type OpsKycSubmissionDetailDto,
} from '../../services/kyc-ops-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { OpsOverlayService } from '../../shared/ops-overlay.service';
import { DESTINATION_COUNTRIES } from '../../types/account.types';
import {
  applicantInitials,
  checkLabel,
  checkStatusClass,
  countryFlag,
  fromAccountListItem,
  fromPendingDto,
  kycStatusTone,
  riskFromChecks,
  riskTone,
  type KycApplicantRow,
  type KycReviewTab,
} from '../../types/kyc.types';

interface KycMetric {
  label: string;
  value: string;
  sub: string;
  subTone?: 'green' | 'amber' | 'red';
  icon: string;
  tone: string;
}

@Component({
  selector: 'ops-kyc-review',
  standalone: true,
  imports: [FormsModule, DatePipe, LowerCasePipe, RouterLink, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kyc-review.component.html',
  styleUrl: './kyc-review.component.css',
})
export class KycReviewComponent implements OnInit, OnDestroy {
  private readonly kycApi = inject(KycOpsApiService);
  private readonly accountsApi = inject(CustomerOpsApiService);
  private readonly session = inject(OpsSessionService);
  private readonly overlay = inject(OpsOverlayService);

  readonly countries = DESTINATION_COUNTRIES;
  readonly applicantInitials = applicantInitials;
  readonly countryFlag = countryFlag;
  readonly riskTone = riskTone;
  readonly kycStatusTone = kycStatusTone;

  readonly checkLabel = checkLabel;
  readonly checkStatusClass = checkStatusClass;
  readonly riskFromChecks = riskFromChecks;

  readonly activeTab = signal<KycReviewTab>('Pending');
  readonly items = signal<KycApplicantRow[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly kycDetail = signal<OpsKycSubmissionDetailDto | null>(null);
  readonly activeDocSide = signal('front');
  readonly documentObjectUrls = signal<Record<string, string>>({});
  readonly pendingCount = signal(0);
  readonly approvedCount = signal(0);
  readonly rejectedCount = signal(0);
  readonly busy = signal(false);
  readonly detailBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  searchQuery = '';
  countryFilter = '';
  idTypeFilter = '';
  riskFilter = '';

  reviewerNotes = '';

  private documentUrlCleanup: (() => void) | null = null;

  readonly filteredItems = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    return this.items().filter((item) => {
      if (this.countryFilter && item.countryCode !== this.countryFilter) return false;
      if (this.idTypeFilter && item.idDocumentType !== this.idTypeFilter) return false;
      if (this.riskFilter && item.riskLevel !== this.riskFilter) return false;
      if (!q) return true;
      return (
        item.displayName.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.phone.toLowerCase().includes(q) ||
        item.idNumber.toLowerCase().includes(q) ||
        (item.suiteNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  });

  readonly idTypeOptions = computed(() => {
    const set = new Set(this.items().map((i) => i.idDocumentType).filter(Boolean));
    return [...set].sort();
  });

  readonly selectedApplicant = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.items().find((i) => i.userId === id) ?? null;
  });

  readonly detailRiskLevel = computed(() => {
    const detail = this.kycDetail();
    if (!detail?.checks.length) return this.selectedApplicant()?.riskLevel ?? 'Low';
    return riskFromChecks(detail.checks);
  });

  documentImageUrl(side: string): string | null {
    return this.documentObjectUrls()[side] ?? null;
  }

  selectDocSide(side: string): void {
    this.activeDocSide.set(side);
  }

  readonly metrics = computed((): KycMetric[] => [
    {
      label: 'Pending Review',
      value: String(this.pendingCount()),
      sub: 'Awaiting ops decision',
      subTone: 'amber',
      icon: 'hourglass_top',
      tone: 'amber',
    },
    {
      label: 'Approved',
      value: String(this.approvedCount()),
      sub: 'Verified customers',
      subTone: 'green',
      icon: 'verified',
      tone: 'green',
    },
    {
      label: 'Rejected',
      value: String(this.rejectedCount()),
      sub: 'Failed verification',
      subTone: 'red',
      icon: 'block',
      tone: 'red',
    },
    {
      label: 'Expiring Soon',
      value: '13',
      sub: 'Within 30 days',
      subTone: 'amber',
      icon: 'event_busy',
      tone: 'indigo',
    },
  ]);

  ngOnInit(): void {
    this.loadCounts();
    this.loadTab();
  }

  ngOnDestroy(): void {
    this.revokeDocumentUrls();
  }

  setTab(tab: KycReviewTab): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.selectedId.set(null);
    this.kycDetail.set(null);
    this.revokeDocumentUrls();
    this.reviewerNotes = '';
    this.loadTab();
  }

  refresh(): void {
    this.loadCounts();
    this.loadTab();
  }

  applyFilters(): void {
    // Client-side filters only; keep current selection.
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.countryFilter = '';
    this.idTypeFilter = '';
    this.riskFilter = '';
    this.selectedId.set(null);
    this.kycDetail.set(null);
    this.revokeDocumentUrls();
  }

  selectApplicant(item: KycApplicantRow): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.selectedId.set(item.userId);
    this.reviewerNotes = '';
    this.activeDocSide.set('front');
    this.revokeDocumentUrls();
    this.detailBusy.set(true);
    this.kycApi.getDetail(item.userId, key).subscribe({
      next: (detail) => {
        this.kycDetail.set(detail);
        this.reviewerNotes = detail.reviewerNotes ?? '';
        const preferred =
          detail.documents.find((d) => d.side !== 'selfie')?.side
          ?? detail.documents[0]?.side
          ?? 'front';
        this.activeDocSide.set(preferred);
        this.loadDocumentImages(detail, key);
        this.detailBusy.set(false);
      },
      error: () => {
        this.kycDetail.set(null);
        this.detailBusy.set(false);
      },
    });
  }

  approveSelected(): void {
    const item = this.selectedApplicant();
    if (!item) return;
    this.approve(item);
  }

  rejectSelected(): void {
    const item = this.selectedApplicant();
    if (!item) return;
    void this.rejectItem(item);
  }

  requestMoreInfo(): void {
    const item = this.selectedApplicant();
    if (!item) return;
    void this.overlay.promptNote({
      title: 'Request more information',
      message: `Send a follow-up request to ${item.displayName}.`,
      hint: 'Ops preview — customer notification is not wired yet.',
      fieldLabel: 'Message to customer',
      required: false,
      confirmLabel: 'Send request',
    });
  }

  approve(item: KycApplicantRow): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.kycApi.approve(item.userId, key, this.reviewerNotes.trim() || undefined).subscribe({
      next: (r) => {
        this.success.set(r.message);
        this.overlay.success(r.message);
        this.selectedId.set(null);
        this.kycDetail.set(null);
        this.loadCounts();
        this.loadTab();
      },
      error: (err) => {
        this.busy.set(false);
        const msg = this.formatError(err);
        this.error.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  reject(item: KycApplicantRow): void {
    void this.rejectItem(item);
  }

  faceMatchDash(pct: number): string {
    const filled = Math.round((pct / 100) * 283);
    return `${filled} 283`;
  }

  private loadCounts(): void {
    const key = this.session.opsKey();
    if (key) {
      this.kycApi.listPending(key).subscribe({
        next: (items) => this.pendingCount.set(items.length),
        error: () => this.pendingCount.set(0),
      });
    }

    this.accountsApi.list({ kycStatus: 'Verified', page: 1, pageSize: 1 }).subscribe({
      next: (res) => this.approvedCount.set(res.totalCount),
      error: () => this.approvedCount.set(0),
    });

    this.accountsApi.list({ kycStatus: 'Rejected', page: 1, pageSize: 1 }).subscribe({
      next: (res) => this.rejectedCount.set(res.totalCount),
      error: () => this.rejectedCount.set(0),
    });
  }

  private loadTab(): void {
    const tab = this.activeTab();
    this.busy.set(true);
    this.error.set(null);

    if (tab === 'Pending') {
      const key = this.session.opsKey();
      if (!key) {
        this.busy.set(false);
        this.error.set('Sign in or set an ops API key to load pending reviews.');
        this.items.set([]);
        return;
      }
      this.kycApi.listPending(key).subscribe({
        next: (items) => {
          this.items.set(items.map(fromPendingDto));
          this.pendingCount.set(items.length);
          this.busy.set(false);
          this.autoSelectFirst();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(this.formatError(err));
          this.items.set([]);
        },
      });
      return;
    }

    const kycStatus = tab === 'Verified' ? 'Verified' : 'Rejected';
    this.accountsApi.list({ kycStatus, page: 1, pageSize: 100 }).subscribe({
      next: (res) => {
        this.items.set(res.items.map((i) => this.enrichListItem(i)));
        if (tab === 'Verified') this.approvedCount.set(res.totalCount);
        if (tab === 'Rejected') this.rejectedCount.set(res.totalCount);
        this.busy.set(false);
        this.autoSelectFirst();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not load KYC applicants.');
        this.items.set([]);
      },
    });
  }

  private enrichListItem(item: OpsCustomerAccountListItemDto): KycApplicantRow {
    return fromAccountListItem({
      userId: item.userId,
      displayName: item.displayName,
      email: item.email,
      phone: item.phone,
      destinationCountryCode: item.destinationCountryCode,
      destinationCountryLabel: item.destinationCountryLabel,
      kycStatus: item.kycStatus,
      suiteNumber: item.suiteNumber,
      memberSinceUtc: item.memberSinceUtc,
    });
  }

  private autoSelectFirst(): void {
    const first = this.filteredItems()[0];
    if (first) {
      this.selectApplicant(first);
    }
  }

  private async rejectItem(item: KycApplicantRow): Promise<void> {
    const key = this.session.opsKey();
    if (!key) return;
    const reason = await this.overlay.promptNote({
      title: 'Reject KYC',
      message: `Reject identity submission for ${item.displayName}.`,
      hint: 'Optional — include guidance if the customer should resubmit.',
      fieldLabel: 'Rejection reason',
      required: false,
      confirmLabel: 'Reject',
    });
    if (reason === null) return;
    this.busy.set(true);
    this.error.set(null);
    this.kycApi.reject(item.userId, key, reason || undefined, this.reviewerNotes.trim() || undefined).subscribe({
      next: (r) => {
        this.success.set(r.message);
        this.overlay.success(r.message);
        this.selectedId.set(null);
        this.kycDetail.set(null);
        this.loadCounts();
        this.loadTab();
      },
      error: (err) => {
        this.busy.set(false);
        const msg = this.formatError(err);
        this.error.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Request failed. Check your ops API key.';
  }

  private loadDocumentImages(detail: OpsKycSubmissionDetailDto, opsKey: string): void {
    this.revokeDocumentUrls();
    const urls: Record<string, string> = {};
    const objectUrls: string[] = [];

    for (const doc of detail.documents.filter((d) => d.confirmed)) {
      this.kycApi.downloadDocument(detail.userId, doc.documentId, opsKey).subscribe({
        next: (blob) => {
          if (blob.size === 0) {
            return;
          }
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          urls[doc.side] = url;
          this.documentObjectUrls.set({ ...urls });
          if (!this.documentObjectUrls()[this.activeDocSide()]) {
            this.activeDocSide.set(doc.side);
          }
        },
      });
    }

    this.documentUrlCleanup = () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }

  private revokeDocumentUrls(): void {
    this.documentUrlCleanup?.();
    this.documentUrlCleanup = null;
    this.documentObjectUrls.set({});
    this.activeDocSide.set('front');
  }
}
