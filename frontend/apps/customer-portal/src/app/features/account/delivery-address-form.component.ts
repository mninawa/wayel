import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PickupLocationPickerComponent } from '@wayel/shared/components/pickup-location-picker.component';
import { environment } from '../../../environments/environment';
import {
  ESWATINI_PICKUP_BRANCHES,
  toPickupBranchSummary,
} from '../../data/eswatini-pickup-branches';
import type {
  DeliveryAddress,
  PickupBranch,
  UpsertDeliveryAddressRequest,
} from '../../models/customer-account.models';
import { CustomerAccountApiService } from '../../services/customer-account-api.service';

@Component({
  selector: 'app-delivery-address-form',
  standalone: true,
  imports: [FormsModule, PickupLocationPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" (ngSubmit)="submit()">
      <fieldset class="branch-fieldset">
        <legend>Pickup branch</legend>
        <p class="branch-hint">
          All Eswatini parcels are collected at a WeYell branch — choose where you will pick up.
        </p>
        <nk-pickup-location-picker
          regionId="eswatini"
          [branches]="branchSummaries()"
          [value]="branchId()"
          [apiKey]="mapsApiKey"
          [showMap]="true"
          [mapHeight]="180"
          ariaLabel="Pickup branch"
          (valueChange)="selectBranch($event)"
        />
      </fieldset>

      <label>
        <span>Nickname (optional)</span>
        <input [(ngModel)]="label" name="label" placeholder="e.g. Work pickup" />
      </label>
      <label>
        <span>Full name (for collection)</span>
        <input [(ngModel)]="fullName" name="fullName" required />
      </label>
      <label>
        <span>Phone</span>
        <input [(ngModel)]="phone" name="phone" required />
      </label>
      <label class="check">
        <input type="checkbox" [(ngModel)]="isDefault" name="isDefault" />
        Set as default pickup branch
      </label>
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button type="button" class="bb-btn bb-btn-ghost" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" class="bb-btn bb-btn-primary" [disabled]="saving() || !canSave()">
          {{ saving() ? 'Saving…' : (editing() ? 'Update pickup' : 'Save pickup branch') }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 0.85rem; }
    .branch-fieldset {
      border: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .branch-fieldset legend {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--bb-muted);
    }
    .branch-hint {
      margin: 0;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); }
    label input {
      font-weight: 400;
      color: var(--bb-text);
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .check { flex-direction: row; align-items: center; gap: 0.5rem; color: var(--bb-text); font-weight: 500; }
    .err { color: #b91c1c; font-size: 0.85rem; margin: 0; }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.35rem; }
  `,
})
export class DeliveryAddressFormComponent implements OnInit {
  private readonly api = inject(CustomerAccountApiService);

  readonly address = input<DeliveryAddress | null>(null);
  readonly saving = input(false);
  readonly saved = output<UpsertDeliveryAddressRequest>();
  readonly cancelled = output<void>();

  readonly mapsApiKey = environment.googleMapsApiKey;
  readonly editing = () => this.address() !== null;
  readonly branches = signal<PickupBranch[]>(ESWATINI_PICKUP_BRANCHES);
  readonly branchSummaries = () => this.branches().map(toPickupBranchSummary);
  readonly branchId = signal('mbabane-plaza');

  label = '';
  fullName = '';
  phone = '';
  isDefault = false;
  error = signal<string | null>(null);

  private snapshot = '';

  constructor() {
    effect(() => {
      const a = this.address();
      if (a) {
        this.branchId.set(a.branchId || 'mbabane-plaza');
        this.label = a.label;
        this.fullName = a.fullName;
        this.phone = a.phone;
        this.isDefault = a.isDefault;
      } else {
        this.branchId.set('mbabane-plaza');
        this.label = '';
        this.fullName = '';
        this.phone = '';
        this.isDefault = false;
      }
      this.snapshot = this.serialize();
    });
  }

  ngOnInit(): void {
    this.api.listPickupBranches().subscribe({
      next: (list) => {
        if (list.length > 0) {
          this.branches.set(list);
        }
      },
    });
  }

  selectBranch(id: string): void {
    this.branchId.set(id);
    this.error.set(null);
  }

  canSave(): boolean {
    return !!this.branchId() && this.serialize() !== this.snapshot;
  }

  submit(): void {
    if (!this.branchId()) {
      this.error.set('Select a pickup branch.');
      return;
    }
    if (!this.fullName.trim()) {
      this.error.set('Full name is required.');
      return;
    }
    if (!this.phone.trim()) {
      this.error.set('Phone number is required.');
      return;
    }
    this.error.set(null);
    this.saved.emit({
      branchId: this.branchId(),
      label: this.label.trim(),
      fullName: this.fullName.trim(),
      phone: this.phone.trim(),
      isDefault: this.isDefault,
    });
  }

  private serialize(): string {
    return JSON.stringify({
      branchId: this.branchId(),
      label: this.label.trim(),
      fullName: this.fullName.trim(),
      phone: this.phone.trim(),
      isDefault: this.isDefault,
    });
  }
}
