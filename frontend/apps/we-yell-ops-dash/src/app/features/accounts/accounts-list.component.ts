import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { RouterLink } from '@angular/router';
import {
  CustomerOpsApiService,
  type OpsCustomerAccountListItemDto,
} from '../../services/customer-ops-api.service';
import {
  SuitePlatformApiService,
  type SuiteNumberDuplicateGroupDto,
} from '../../services/suite-platform-api.service';
import {
  DESTINATION_COUNTRIES,
  KYC_STATUS_OPTIONS,
  SUITE_STATUS_OPTIONS,
  accountRoutes,
} from '../../types/account.types';

@Component({
  selector: 'ops-accounts-list',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accounts-list.component.html',
  styleUrl: './accounts-list.component.css',
})
export class AccountsListComponent implements OnInit {
  private readonly api = inject(CustomerOpsApiService);
  private readonly platformApi = inject(SuitePlatformApiService);

  readonly routes = accountRoutes;
  readonly kycOptions = KYC_STATUS_OPTIONS;
  readonly suiteOptions = SUITE_STATUS_OPTIONS;
  readonly countries = DESTINATION_COUNTRIES;

  readonly items = signal<OpsCustomerAccountListItemDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly duplicateGroups = signal<SuiteNumberDuplicateGroupDto[]>([]);
  readonly reassigningUserId = signal<string | null>(null);
  readonly duplicateError = signal<string | null>(null);
  readonly duplicateNotice = signal<string | null>(null);

  searchFilter = '';
  kycFilter = '';
  countryFilter = '';
  suiteFilter = '';

  ngOnInit(): void {
    this.refresh();
    this.loadDuplicates();
  }

  loadDuplicates(): void {
    this.platformApi.listDuplicates().subscribe({
      next: (groups) => this.duplicateGroups.set(groups),
      error: () => {
        this.duplicateGroups.set([]);
      },
    });
  }

  reassign(userId: string, suiteNumber: string): void {
    if (this.reassigningUserId() !== null) {
      return;
    }
    this.reassigningUserId.set(userId);
    this.duplicateError.set(null);
    this.duplicateNotice.set(null);

    this.platformApi.reassignSuiteNumber(userId).subscribe({
      next: (res) => {
        this.reassigningUserId.set(null);
        this.duplicateNotice.set(
          `Reassigned: ${res.previousSuiteNumber} → ${res.newSuiteNumber}`,
        );
        // Reload both lists so the operator sees the new state immediately
        // rather than a stale duplicate row sitting under a "Reassigned" toast.
        this.loadDuplicates();
        this.refresh();
      },
      error: (err) => {
        this.reassigningUserId.set(null);
        this.duplicateError.set(
          err?.error?.detail ?? err?.error?.title ?? 'Could not reassign suite number.',
        );
      },
    });
  }

  refresh(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api
      .list({
        search: this.searchFilter.trim() || undefined,
        kycStatus: this.kycFilter || undefined,
        country: this.countryFilter || undefined,
        suiteStatus: this.suiteFilter || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.totalCount.set(res.totalCount);
          this.page.set(res.page);
          this.busy.set(false);
        },
        error: () => {
          this.error.set('Could not load customer accounts.');
          this.busy.set(false);
        },
      });
  }

  applyFilters(): void {
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.searchFilter = '';
    this.kycFilter = '';
    this.countryFilter = '';
    this.suiteFilter = '';
    this.page.set(1);
    this.refresh();
  }

  kycClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'verified') return 'green';
    if (s === 'pending') return 'amber';
    if (s === 'rejected') return 'red';
    return 'gray';
  }

  suiteClass(status: string | null): string {
    if (!status) return 'gray';
    const s = status.toLowerCase();
    if (s === 'active') return 'green';
    if (s === 'expiringsoon') return 'amber';
    if (s === 'expired' || s === 'suspended') return 'red';
    return 'gray';
  }
}
