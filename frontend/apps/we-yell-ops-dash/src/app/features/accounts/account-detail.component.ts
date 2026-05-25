import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CustomerOpsApiService,
  type OpsCustomerAccountDetailDto,
  type SuitePaymentsOverviewDto,
  type SuitePlanDto,
} from '../../services/customer-ops-api.service';
import { KycOpsApiService } from '../../services/kyc-ops-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { accountRoutes } from '../../types/account.types';

type DetailTab = 'overview' | 'address' | 'plan' | 'billing' | 'profile';

type PaymentStatus = 'Successful' | 'Failed' | 'Pending';

interface BillingPaymentRow {
  id: string;
  dateUtc: string;
  description: string;
  plan: string;
  amountZar: number;
  methodLabel: string;
  methodIcon: string;
  status: PaymentStatus;
  invoiceId: string;
  canRetry: boolean;
}

interface BillingPaymentMethod {
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}

interface PlanOption {
  id: string;
  name: string;
  priceZar: number;
  durationMonths: number;
  features: string[];
  isRecommended: boolean;
}

interface PlanBenefitRow {
  label: string;
  monthly: boolean;
  quarterly: boolean;
}

interface RenewalActivityRow {
  id: string;
  icon: string;
  title: string;
  dateUtc: string;
  status: string;
  statusTone: 'green' | 'blue' | 'amber' | 'gray';
  amountZar: number | null;
}

interface AddressActivityRow {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  dateUtc: string;
  status: string;
  statusTone: 'green' | 'blue' | 'amber' | 'gray';
}

function normaliseActivityTone(value: string): AddressActivityRow['statusTone'] {
  const v = value.toLowerCase();
  if (v === 'green' || v === 'blue' || v === 'amber' || v === 'gray') return v;
  return 'gray';
}

const LOCKED_ACTIONS = [
  'Approve Quote',
  'Pay for shipping',
  'Create shipment',
  'Courier parcels',
] as const;

function normalisePaymentStatus(raw: string): PaymentStatus {
  const s = (raw ?? '').toLowerCase();
  if (s === 'successful' || s === 'completed' || s === 'paid') return 'Successful';
  if (s === 'failed' || s === 'declined') return 'Failed';
  return 'Pending';
}

@Component({
  selector: 'ops-account-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-detail.component.html',
  styleUrl: './account-detail.component.css',
})
export class AccountDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CustomerOpsApiService);
  private readonly kycApi = inject(KycOpsApiService);
  private readonly session = inject(OpsSessionService);

  readonly routes = accountRoutes;
  readonly lockedActions = LOCKED_ACTIONS;
  readonly detail = signal<OpsCustomerAccountDetailDto | null>(null);
  readonly payments = signal<SuitePaymentsOverviewDto | null>(null);
  readonly paymentsLoading = signal(false);
  readonly tab = signal<DetailTab>('overview');
  readonly selectedRenewal = signal<'monthly' | 'quarterly'>('monthly');
  readonly busy = signal(false);
  readonly actionBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  readonly isExpired = computed(() => {
    const sub = this.detail()?.subscription;
    return sub?.status === 'Expired' || sub?.shipOutLocked === true;
  });

  readonly isExpiringSoon = computed(() => this.detail()?.subscription?.status === 'ExpiringSoon');

  readonly pageTitle = computed(() => {
    if (this.isExpired()) return 'Suite Expired – Renewal Required';
    if (this.isExpiringSoon()) return 'Suite Expiring Soon – Renew to Continue';
    return 'Account & Suite';
  });

  readonly suiteStatusLabel = computed(() => {
    const sub = this.detail()?.subscription;
    if (!sub) return 'No suite';
    if (sub.status === 'Expired') return 'Expired';
    if (sub.shipOutLocked) return 'Locked';
    return sub.status;
  });

  readonly shipOutLabel = computed(() =>
    this.detail()?.subscription?.shipOutLocked ? 'Locked' : 'Available',
  );

  readonly showExpiredUi = computed(() => this.isExpired() || this.isExpiringSoon());

  readonly lockedActionsVisible = computed(() => this.detail()?.subscription?.shipOutLocked === true);

  readonly outstandingRenewal = computed(() => 'R100 or R200');

  readonly tabTitle = computed(() => {
    switch (this.tab()) {
      case 'profile':
        return 'Profile & Security';
      case 'address':
        return 'My Address & Suite Details';
      case 'plan':
        return 'Plan & Renewal';
      case 'billing':
        return 'Billing & Payment History';
      default:
        return this.pageTitle();
    }
  });

  readonly tabSubtitle = computed(() => {
    switch (this.tab()) {
      case 'profile':
        return 'Manage personal information, security settings and account preferences.';
      case 'address':
        return 'View and manage the South African suite address and related details.';
      case 'plan':
        return 'Manage your suite plan, renewals and access settings.';
      case 'billing':
        return 'View payment history, saved methods and invoices.';
      default:
        return '';
    }
  });

  readonly profileInitials = computed(() => {
    const name = this.detail()?.account.profile.displayName?.trim() ?? '';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';
  });

  readonly deliveryLabel = computed(() => {
    const method = this.detail()?.account.profile.preferredDeliveryMethod ?? '';
    if (method.toUpperCase() === 'PUDO') return 'Door-to-Door';
    if (method.toUpperCase() === 'BRANCH') return 'Branch pickup';
    return method || '—';
  });

  readonly idDocumentLabel = computed(() => {
    const type = this.detail()?.account.profile.idDocumentType ?? '';
    if (type.toLowerCase().includes('passport')) return 'Passport';
    return 'National ID';
  });

  readonly countryFlag = computed(() => {
    const code = this.detail()?.account.profile.destinationCountryCode?.toUpperCase();
    if (code === 'SZ') return '🇸🇿';
    if (code === 'BW') return '🇧🇼';
    if (code === 'NA') return '🇳🇦';
    if (code === 'ZA') return '🇿🇦';
    return '🌍';
  });

  readonly lastPasswordLabel = computed(() => {
    const login = this.detail()?.lastLoginUtc;
    if (!login) return 'Not available';
    return `Last changed on ${new Date(login).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  });

  readonly securityTips = [
    { icon: 'lock', tone: 'purple', title: 'Use a strong password', text: 'Choose a unique password with letters, numbers and symbols.' },
    { icon: 'verified_user', tone: 'green', title: 'Enable two-factor authentication', text: 'Add an extra layer of security to the account.' },
    { icon: 'mail', tone: 'amber', title: 'Keep email updated', text: 'Ensure notifications and recovery codes reach the customer.' },
    { icon: 'devices', tone: 'blue', title: 'Review active sessions', text: 'Sign out unused devices and browsers regularly.' },
  ] as const;

  editingProfile = signal(false);
  twoFactorEnabled = signal(false);
  notificationsOpen = signal(false);
  billingStatusFilter = signal<'all' | PaymentStatus>('all');
  autoRenewEnabled = signal(false);
  selectedPlanOption = signal<string | null>(null);

  readonly planOptions = signal<PlanOption[]>([]);
  readonly planOptionsLoading = signal(false);

  readonly renewalRules = [
    'All plans are paid upfront before suite access is extended.',
    'Parcels cannot be couriered until the suite fee is paid.',
    'Your suite number stays reserved even if the plan expires.',
    'Renew early to avoid ship-out access being locked.',
    'Switch plans anytime — changes apply on the next renewal.',
  ] as const;

  readonly planBenefits: PlanBenefitRow[] = [
    { label: 'Suite reserved', monthly: true, quarterly: true },
    { label: 'Ship-out access when paid', monthly: true, quarterly: true },
    { label: 'Receive parcels while expired', monthly: true, quarterly: true },
    { label: 'Auto-renew option', monthly: true, quarterly: true },
    { label: 'Best value pricing', monthly: false, quarterly: true },
    { label: 'Priority renewal reminders', monthly: false, quarterly: true },
  ];

  readonly currentPlanId = computed((): string | null => {
    return this.detail()?.subscription?.planId ?? null;
  });

  readonly paidUntilLabel = computed(() => {
    const expires = this.detail()?.subscription?.expiresAtUtc;
    if (!expires) return '—';
    return new Date(expires).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  });

  readonly nextRenewalLabel = computed(() => {
    const expires = this.detail()?.subscription?.expiresAtUtc;
    if (!expires) return '—';
    const next = new Date(expires);
    next.setDate(next.getDate() + 1);
    return next.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  });

  readonly shipOutAccessLabel = computed(() =>
    this.detail()?.subscription?.shipOutLocked ? 'Locked' : 'Enabled',
  );

  readonly renewalActivity = computed((): RenewalActivityRow[] => {
    const sub = this.detail()?.subscription;
    const pay = this.payments();
    if (!sub && !pay) return [];

    const rows: RenewalActivityRow[] = [];

    const lastPayment = pay?.lastPayment;
    if (lastPayment) {
      rows.push({
        id: `payment-${lastPayment.reference}`,
        icon: 'payments',
        title: 'Payment received',
        dateUtc: lastPayment.paidAtUtc,
        status: 'Paid',
        statusTone: 'green',
        amountZar: lastPayment.amountZar,
      });
    }

    if (sub?.startedAtUtc) {
      rows.push({
        id: `start-${sub.subscriptionId}`,
        icon: 'autorenew',
        title: `${sub.planName} activated`,
        dateUtc: sub.startedAtUtc,
        status: 'Completed',
        statusTone: 'green',
        amountZar: sub.planPriceZar,
      });
      if (!sub.shipOutLocked) {
        rows.push({
          id: `ship-out-${sub.subscriptionId}`,
          icon: 'local_shipping',
          title: 'Ship-out access enabled',
          dateUtc: sub.startedAtUtc,
          status: 'Enabled',
          statusTone: 'green',
          amountZar: null,
        });
      }
    }

    const next = pay?.nextPayment;
    if (next) {
      const reminder = new Date(next.dueAtUtc);
      reminder.setDate(reminder.getDate() - 14);
      rows.push({
        id: 'auto-renew-reminder',
        icon: 'notifications',
        title: 'Renewal reminder scheduled',
        dateUtc: reminder.toISOString(),
        status: 'Scheduled',
        statusTone: 'blue',
        amountZar: null,
      });
    }

    return rows.sort((a, b) => new Date(b.dateUtc).getTime() - new Date(a.dateUtc).getTime());
  });

  readonly howItWorksSteps = [
    { icon: 'shopping_bag', title: 'Shop online as usual', text: 'Use your favourite international stores.' },
    { icon: 'home', title: 'Enter your suite address', text: 'Use the WeYell Johannesburg suite as your delivery address.' },
    { icon: 'inventory_2', title: 'We receive & notify you', text: 'Parcels are logged and you get a notification when they arrive.' },
    { icon: 'local_shipping', title: 'Ship to Eswatini', text: 'Consolidate and courier parcels to your local delivery address.' },
  ] as const;

  readonly suiteTitle = computed(() => {
    const suite = this.detail()?.account.suiteAddress?.suiteNumber
      ?? this.detail()?.subscription?.suiteNumber
      ?? '—';
    return `WeYell Suite - ${suite}`;
  });

  readonly suiteAddressLines = computed(() => {
    const suite = this.detail()?.account.suiteAddress;
    if (!suite) return [] as string[];
    const lines = [
      suite.warehouseName || suite.label,
      suite.recipientName,
      suite.line1,
      suite.line2,
      [suite.city, suite.province, suite.postalCode].filter(Boolean).join(', '),
      suite.country,
    ].filter((line): line is string => Boolean(line && line.trim()));
    if (lines.length > 0) return lines;
    return suite.formatted.split('\n').map((line) => line.trim()).filter(Boolean);
  });

  readonly receivingStatusLabel = computed(() => {
    const sub = this.detail()?.subscription;
    if (!sub) return 'Inactive';
    if (sub.status === 'Expired') return 'Expired';
    return 'Active';
  });

  readonly reservedDaysLabel = computed(() => {
    const days = this.daysUntilNextPayment();
    if (days === null) return '—';
    return `${days} day${days === 1 ? '' : 's'} remaining`;
  });

  readonly addressActivity = signal<AddressActivityRow[]>([]);
  readonly addressActivityLoading = signal(false);

  readonly defaultPaymentMethod = computed((): BillingPaymentMethod | null => {
    const method = this.payments()?.paymentMethod;
    if (!method) return null;
    const parts = method.descriptor.split(' ');
    const last4Match = method.descriptor.match(/\d{4}/);
    return {
      brand: parts[0] || method.provider,
      last4: last4Match?.[0] ?? '••••',
      expiry: '—',
      isDefault: method.isDefault,
    };
  });

  readonly billingPlanLabel = computed(() => {
    const sub = this.detail()?.subscription;
    if (!sub) return 'No active plan';
    return sub.planName;
  });

  readonly billingPlanPriceLabel = computed(() => {
    const sub = this.detail()?.subscription;
    if (!sub) return '—';
    return `R${sub.planPriceZar} / ${sub.planDurationMonths} month${sub.planDurationMonths === 1 ? '' : 's'}`;
  });

  readonly nextPaymentAmount = computed(() => {
    const next = this.payments()?.nextPayment;
    if (next) return `R${next.amountZar}`;
    const sub = this.detail()?.subscription;
    return sub ? `R${sub.planPriceZar}` : '—';
  });

  readonly nextPaymentDate = computed(() => {
    const next = this.payments()?.nextPayment?.dueAtUtc
      ?? this.detail()?.subscription?.expiresAtUtc;
    if (!next) return '—';
    return new Date(next).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  });

  readonly daysUntilNextPayment = computed(() => {
    const next = this.payments()?.nextPayment;
    if (next) return next.daysRemaining;
    const expires = this.detail()?.subscription?.expiresAtUtc;
    if (!expires) return null;
    const diffMs = new Date(expires).getTime() - Date.now();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  });

  readonly lastPaymentAmount = computed(() => {
    const last = this.payments()?.lastPayment;
    return last ? `R${last.amountZar}` : this.nextPaymentAmount();
  });

  readonly lastPaymentDate = computed(() => {
    const last = this.payments()?.lastPayment?.paidAtUtc
      ?? this.detail()?.subscription?.startedAtUtc;
    if (!last) return '—';
    return new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  });

  readonly paymentHistory = computed((): BillingPaymentRow[] => {
    const rows = this.payments()?.history ?? [];
    const methodLabel = this.payments()?.paymentMethod?.descriptor ?? 'Card';
    return rows.map<BillingPaymentRow>((row) => ({
      id: row.reference,
      dateUtc: row.completedAtUtc ?? row.createdAtUtc,
      description: `${row.planName}`,
      plan: row.planName,
      amountZar: row.amountZar,
      methodLabel,
      methodIcon: 'credit_card',
      status: normalisePaymentStatus(row.status),
      invoiceId: row.invoiceNumber,
      canRetry: row.status.toLowerCase() === 'failed',
    }));
  });

  readonly filteredPaymentHistory = computed(() => {
    const filter = this.billingStatusFilter();
    const rows = this.paymentHistory();
    if (filter === 'all') return rows;
    return rows.filter((row) => row.status === filter);
  });

  readonly invoiceSummary = computed(() => {
    const summary = this.payments()?.summary;
    if (summary) {
      return {
        total: summary.totalInvoices,
        paid: summary.paid,
        failed: summary.failed,
        totalPaidZar: summary.totalPaidZar,
      };
    }
    return { total: 0, paid: 0, failed: 0, totalPaidZar: 0 };
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const userId = params.get('userId');
      if (userId) this.load(userId);
    });
  }

  setTab(tab: DetailTab): void {
    this.tab.set(tab);
  }

  selectRenewal(plan: 'monthly' | 'quarterly'): void {
    this.selectedRenewal.set(plan);
  }

  refresh(): void {
    const id = this.detail()?.account.profile.userId;
    if (id) this.load(id);
  }

  approveKyc(): void {
    const id = this.detail()?.account.profile.userId;
    const key = this.session.opsKey();
    if (!id || !key) return;
    this.actionBusy.set(true);
    this.kycApi.approve(id, key).subscribe({
      next: (res) => {
        this.message.set(res.message);
        this.actionBusy.set(false);
        this.refresh();
      },
      error: (err) => {
        this.actionBusy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  rejectKyc(): void {
    const id = this.detail()?.account.profile.userId;
    const key = this.session.opsKey();
    if (!id || !key) return;
    this.actionBusy.set(true);
    this.kycApi.reject(id, key).subscribe({
      next: (res) => {
        this.message.set(res.message);
        this.actionBusy.set(false);
        this.refresh();
      },
      error: (err) => {
        this.actionBusy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  statusClass(status: string): string {
    const s = status.toLowerCase();
    if (s === 'verified' || s === 'active' || s === 'available' || s === 'successful' || s === 'enabled' || s === 'completed' || s === 'delivered' || s === 'received') return 'green';
    if (s === 'pending' || s === 'expiringsoon' || s === 'processing') return 'amber';
    if (s === 'expired' || s === 'locked' || s === 'rejected' || s === 'suspended' || s === 'failed' || s === 'inactive') return 'red';
    if (s === 'in transit') return 'blue';
    return 'gray';
  }

  setBillingStatusFilter(value: string): void {
    if (value === 'Successful' || value === 'Failed' || value === 'Pending') {
      this.billingStatusFilter.set(value);
      return;
    }
    this.billingStatusFilter.set('all');
  }

  selectPlanOption(planId: string): void {
    this.selectedPlanOption.set(planId);
  }

  toggleAutoRenew(): void {
    this.autoRenewEnabled.update((v) => !v);
  }

  activityStatusClass(tone: RenewalActivityRow['statusTone']): string {
    if (tone === 'green') return 'green';
    if (tone === 'blue') return 'blue';
    if (tone === 'amber') return 'amber';
    return 'gray';
  }

  toggleEditingProfile(): void {
    this.editingProfile.update((v) => !v);
  }

  toggleTwoFactor(): void {
    this.twoFactorEnabled.update((v) => !v);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update((v) => !v);
  }

  private load(userId: string): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.get(userId).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.selectedPlanOption.set(d.subscription?.planId ?? null);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
    this.loadPayments(userId);
    this.loadPlanOptions();
    this.loadAddressActivity(userId);
  }

  private loadAddressActivity(userId: string): void {
    this.addressActivityLoading.set(true);
    this.api.getAddressActivity(userId, 20).subscribe({
      next: (items) => {
        this.addressActivity.set(items.map<AddressActivityRow>((i) => ({
          id: i.id,
          icon: i.icon,
          title: i.title,
          subtitle: i.subtitle ?? '',
          dateUtc: i.dateUtc,
          status: i.status,
          statusTone: normaliseActivityTone(i.statusTone),
        })));
        this.addressActivityLoading.set(false);
      },
      error: () => {
        this.addressActivity.set([]);
        this.addressActivityLoading.set(false);
      },
    });
  }

  private loadPayments(userId: string): void {
    this.paymentsLoading.set(true);
    this.api.getSuitePayments(userId).subscribe({
      next: (overview) => {
        this.payments.set(overview);
        this.paymentsLoading.set(false);
      },
      error: () => {
        this.payments.set(null);
        this.paymentsLoading.set(false);
      },
    });
  }

  private loadPlanOptions(): void {
    if (this.planOptions().length > 0) return;
    this.planOptionsLoading.set(true);
    this.api.listSuitePlans().subscribe({
      next: (plans) => {
        const options = plans.map<PlanOption>((p) => ({
          id: p.id,
          name: p.name,
          priceZar: p.priceZar,
          durationMonths: p.durationMonths,
          isRecommended: p.isRecommended,
          features: this.featuresFor(p),
        }));
        this.planOptions.set(options);
        this.planOptionsLoading.set(false);
        const current = this.detail()?.subscription?.planId;
        if (current && options.some((p) => p.id === current)) {
          this.selectedPlanOption.set(current);
          return;
        }
        const recommended = options.find((p) => p.isRecommended) ?? options[0];
        if (recommended) this.selectedPlanOption.set(recommended.id);
      },
      error: () => {
        this.planOptions.set([]);
        this.planOptionsLoading.set(false);
      },
    });
  }

  private featuresFor(plan: SuitePlanDto): string[] {
    const features = ['Pay upfront', 'Suite remains reserved'];
    if (plan.durationMonths >= 3) features.splice(1, 0, 'Best value');
    else features.splice(1, 0, 'Auto-renew available');
    return features;
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string } | null;
      return body?.detail ?? body?.message ?? 'Request failed.';
    }
    return 'Request failed.';
  }
}
