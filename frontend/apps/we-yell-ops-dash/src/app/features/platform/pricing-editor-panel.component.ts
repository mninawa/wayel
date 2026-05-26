import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PricingOpsApiService,
  type BorderBoxPricingConfigDto,
  type BorderBoxPricingConfigUpdate,
} from '../../services/pricing-ops-api.service';

/**
 * Pricing editor — owns the entire pricing form, validation, banners and
 * save/reset footer. Renders without page chrome so it can be embedded as
 * the "Pricing" tab on `/ops/platform/suites?tab=pricing`. The historical
 * standalone `/ops/platform/pricing` route now redirects here.
 *
 * Pricing config is global (not per-region); the component picks up the
 * single platform-wide record on init and pushes updates back to the API.
 */
@Component({
  selector: 'ops-pricing-editor-panel',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pricing-editor-panel.component.html',
  styleUrl: './pricing-editor-panel.component.css',
})
export class PricingEditorPanelComponent implements OnInit {
  private readonly api = inject(PricingOpsApiService);

  /** Show the "Updated …" pill above the form (omit when caller renders one). */
  @Input() showUpdatedPill = false;

  readonly config = signal<BorderBoxPricingConfigDto | null>(null);
  readonly form = signal<BorderBoxPricingConfigUpdate>(this.emptyForm());
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly samplePreview = computed(() => {
    const f = this.form();
    const sampleWeightKg = 5;
    const sampleGoodsValueZar = 1500;
    const dutyDue = sampleGoodsValueZar > f.dutyGoodsValueThresholdZar
      ? sampleGoodsValueZar * f.dutyRate
      : 0;
    const vat = f.chargeVat ? sampleGoodsValueZar * f.vatRate : 0;
    const weightSurcharge = f.chargeWeightSurcharge ? sampleWeightKg * f.perKgSurchargeZar : 0;
    const handlingFee = sampleGoodsValueZar * f.paymentHandlingFeeRate;
    const door = f.doorToDoorFlatFeeZar + weightSurcharge + dutyDue + vat + handlingFee;
    const pudo = f.pudoFlatFeeZar + weightSurcharge + dutyDue + vat + handlingFee;
    return {
      sampleWeightKg,
      sampleGoodsValueZar,
      dutyDue,
      vat,
      weightSurcharge,
      handlingFee,
      doorToDoorTotal: door,
      pudoTotal: pudo,
    };
  });

  readonly serviceShareTotal = computed(() => {
    const f = this.form();
    return f.handlingFeeShareZar + f.pickupFeeShareZar;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    this.api.getConfig().subscribe({
      next: (dto) => {
        this.config.set(dto);
        this.form.set(this.fromDto(dto));
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  save(): void {
    if (!this.isValid()) {
      this.error.set('Please fix the highlighted fields before saving.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.message.set(null);
    this.api.updateConfig(this.form()).subscribe({
      next: (dto) => {
        this.config.set(dto);
        this.form.set(this.fromDto(dto));
        this.saving.set(false);
        this.message.set('Pricing configuration updated.');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  reset(): void {
    const current = this.config();
    if (current) this.form.set(this.fromDto(current));
    this.message.set(null);
    this.error.set(null);
  }

  patch<K extends keyof BorderBoxPricingConfigUpdate>(
    key: K,
    value: BorderBoxPricingConfigUpdate[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  toggle(key: 'chargeVat' | 'chargeWeightSurcharge'): void {
    this.form.update((f) => ({ ...f, [key]: !f[key] }));
  }

  isValid(): boolean {
    const f = this.form();
    if (f.pudoFlatFeeZar < 0 || f.doorToDoorFlatFeeZar < 0 || f.perKgSurchargeZar < 0) return false;
    if (f.dutyRate < 0 || f.dutyRate > 1) return false;
    if (f.vatRate < 0 || f.vatRate > 1) return false;
    if (f.paymentHandlingFeeRate < 0 || f.paymentHandlingFeeRate > 1) return false;
    if (f.dutyGoodsValueThresholdZar < 0) return false;
    if (f.handlingFeeShareZar < 0 || f.pickupFeeShareZar < 0) return false;
    if (this.serviceShareTotal() <= 0) return false;
    return true;
  }

  private fromDto(dto: BorderBoxPricingConfigDto): BorderBoxPricingConfigUpdate {
    return {
      chargeVat: dto.chargeVat,
      chargeWeightSurcharge: dto.chargeWeightSurcharge,
      pudoFlatFeeZar: dto.pudoFlatFeeZar,
      doorToDoorFlatFeeZar: dto.doorToDoorFlatFeeZar,
      perKgSurchargeZar: dto.perKgSurchargeZar,
      dutyRate: dto.dutyRate,
      vatRate: dto.vatRate,
      dutyGoodsValueThresholdZar: dto.dutyGoodsValueThresholdZar,
      paymentHandlingFeeRate: dto.paymentHandlingFeeRate,
      handlingFeeShareZar: dto.handlingFeeShareZar,
      pickupFeeShareZar: dto.pickupFeeShareZar,
    };
  }

  private emptyForm(): BorderBoxPricingConfigUpdate {
    return {
      chargeVat: true,
      chargeWeightSurcharge: false,
      pudoFlatFeeZar: 0,
      doorToDoorFlatFeeZar: 0,
      perKgSurchargeZar: 0,
      dutyRate: 0,
      vatRate: 0.15,
      dutyGoodsValueThresholdZar: 10000,
      paymentHandlingFeeRate: 0.1,
      handlingFeeShareZar: 50,
      pickupFeeShareZar: 100,
    };
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string; message?: string } | null;
      return body?.detail ?? body?.title ?? body?.message ?? 'Request failed.';
    }
    return 'Request failed.';
  }
}
