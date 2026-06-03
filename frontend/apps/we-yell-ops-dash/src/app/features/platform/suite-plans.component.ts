import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import {
  SuitePlansOpsApiService,
  type CreateSuitePlanRequest,
  type SuitePlanAdminDto,
} from '../../services/suite-plans-ops-api.service';
import { platformRoutes } from '../../types/platform.types';

interface PlanForm {
  id: string | null;
  name: string;
  durationMonths: number;
  priceZar: number;
  isRecommended: boolean;
  paystackPlanCode: string;
}

@Component({
  selector: 'ops-suite-plans',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suite-plans.component.html',
  styleUrl: './suite-plans.component.css',
})
export class SuitePlansComponent implements OnInit {
  private readonly api = inject(SuitePlansOpsApiService);

  readonly routes = platformRoutes;

  readonly plans = signal<SuitePlanAdminDto[]>([]);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly syncing = signal(false);
  readonly editing = signal<PlanForm | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly confirmingId = signal<string | null>(null);

  readonly activePlans = computed(() => this.plans().filter((p) => p.isActive));
  readonly archivedPlans = computed(() => this.plans().filter((p) => !p.isActive));

  readonly totals = computed(() => {
    const all = this.plans();
    return {
      total: all.length,
      active: all.filter((p) => p.isActive).length,
      recommended: all.filter((p) => p.isRecommended && p.isActive).length,
    };
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (rows) => {
        this.plans.set(rows);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  startCreate(): void {
    this.message.set(null);
    this.error.set(null);
    this.editing.set({
      id: null,
      name: '',
      durationMonths: 1,
      priceZar: 100,
      isRecommended: false,
      paystackPlanCode: '',
    });
  }

  startEdit(plan: SuitePlanAdminDto): void {
    this.message.set(null);
    this.error.set(null);
    this.editing.set({
      id: plan.id,
      name: plan.name,
      durationMonths: plan.durationMonths,
      priceZar: plan.priceZar,
      isRecommended: plan.isRecommended,
      paystackPlanCode: plan.paystackPlanCode ?? '',
    });
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.error.set(null);
  }

  patch<K extends keyof PlanForm>(key: K, value: PlanForm[K]): void {
    this.editing.update((f) => (f ? { ...f, [key]: value } : f));
  }

  isValid(): boolean {
    const f = this.editing();
    if (!f) return false;
    if (!f.name.trim()) return false;
    if (!Number.isFinite(f.durationMonths) || f.durationMonths < 1 || f.durationMonths > 36) return false;
    if (!Number.isFinite(f.priceZar) || f.priceZar < 0) return false;
    return true;
  }

  save(): void {
    const f = this.editing();
    if (!f || !this.isValid()) return;
    const body: CreateSuitePlanRequest = {
      name: f.name.trim(),
      durationMonths: f.durationMonths,
      priceZar: f.priceZar,
      isRecommended: f.isRecommended,
      paystackPlanCode: f.paystackPlanCode.trim() || null,
    };
    this.saving.set(true);
    this.error.set(null);

    const op$ = f.id ? this.api.update(f.id, body) : this.api.create(body);
    op$.subscribe({
      next: (saved) => {
        this.upsertPlan(saved);
        this.saving.set(false);
        this.editing.set(null);
        this.message.set(f.id ? `Updated "${saved.name}".` : `Created "${saved.name}".`);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  confirmArchive(plan: SuitePlanAdminDto): void {
    this.confirmingId.set(plan.id);
  }

  cancelArchive(): void {
    this.confirmingId.set(null);
  }

  archive(plan: SuitePlanAdminDto): void {
    this.toggleActive(plan, false, `Archived "${plan.name}".`);
    this.confirmingId.set(null);
  }

  restore(plan: SuitePlanAdminDto): void {
    this.toggleActive(plan, true, `Restored "${plan.name}".`);
  }

  syncPaystack(): void {
    this.syncing.set(true);
    this.error.set(null);
    this.api.syncPaystack().subscribe({
      next: (result) => {
        this.syncing.set(false);
        this.message.set(
          result.plansUpdated > 0
            ? `Synced ${result.plansUpdated} plan(s) with Paystack.`
            : 'All active plans are already linked to Paystack.',
        );
        this.load();
      },
      error: (err) => {
        this.syncing.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  private toggleActive(plan: SuitePlanAdminDto, active: boolean, successMessage: string): void {
    this.saving.set(true);
    this.error.set(null);
    const op$ = active ? this.api.activate(plan.id) : this.api.deactivate(plan.id);
    op$.subscribe({
      next: (updated) => {
        this.upsertPlan(updated);
        this.saving.set(false);
        this.message.set(successMessage);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  private upsertPlan(plan: SuitePlanAdminDto): void {
    this.plans.update((list) => {
      const idx = list.findIndex((p) => p.id === plan.id);
      if (idx === -1) return [...list, plan];
      const next = [...list];
      next[idx] = plan;
      return next;
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string; message?: string } | null;
      return body?.detail ?? body?.title ?? body?.message ?? 'Request failed.';
    }
    return 'Request failed.';
  }
}
