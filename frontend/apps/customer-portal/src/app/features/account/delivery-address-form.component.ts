import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  DeliveryAddress,
  UpsertDeliveryAddressRequest,
} from '../../models/customer-account.models';

@Component({
  selector: 'app-delivery-address-form',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" (ngSubmit)="submit()">
      <label>
        <span>Label</span>
        <input [(ngModel)]="label" name="label" placeholder="Home, Office…" required />
      </label>
      <label>
        <span>Full name</span>
        <input [(ngModel)]="fullName" name="fullName" required />
      </label>
      <label>
        <span>Phone</span>
        <input [(ngModel)]="phone" name="phone" required />
      </label>
      <label>
        <span>Address line 1</span>
        <input [(ngModel)]="line1" name="line1" required />
      </label>
      <label>
        <span>Address line 2 (optional)</span>
        <input [(ngModel)]="line2" name="line2" />
      </label>
      <div class="row2">
        <label>
          <span>City / Town</span>
          <input [(ngModel)]="city" name="city" required />
        </label>
        <label>
          <span>Region</span>
          <input [(ngModel)]="region" name="region" required />
        </label>
      </div>
      <label class="check">
        <input type="checkbox" [(ngModel)]="isDefault" name="isDefault" />
        Set as default delivery address
      </label>
      <div class="actions">
        <button type="button" class="bb-btn bb-btn-ghost" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" class="bb-btn bb-btn-primary" [disabled]="saving()">
          {{ saving() ? 'Saving…' : (editing() ? 'Update address' : 'Add address') }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 0.75rem; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); }
    label input {
      font-weight: 400;
      color: var(--bb-text);
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .check { flex-direction: row; align-items: center; gap: 0.5rem; color: var(--bb-text); font-weight: 500; }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.35rem; }
  `,
})
export class DeliveryAddressFormComponent {
  readonly address = input<DeliveryAddress | null>(null);
  readonly saving = input(false);
  readonly saved = output<UpsertDeliveryAddressRequest>();
  readonly cancelled = output<void>();

  readonly editing = () => this.address() !== null;

  label = 'Home';
  fullName = '';
  phone = '';
  line1 = '';
  line2 = '';
  city = '';
  region = '';
  isDefault = false;

  constructor() {
    effect(() => {
      const a = this.address();
      if (a) {
        this.label = a.label;
        this.fullName = a.fullName;
        this.phone = a.phone;
        this.line1 = a.line1;
        this.line2 = a.line2 ?? '';
        this.city = a.city;
        this.region = a.region;
        this.isDefault = a.isDefault;
      } else {
        this.label = 'Home';
        this.fullName = '';
        this.phone = '';
        this.line1 = '';
        this.line2 = '';
        this.city = '';
        this.region = 'Manzini Region';
        this.isDefault = false;
      }
    });
  }

  submit(): void {
    this.saved.emit({
      label: this.label.trim(),
      fullName: this.fullName.trim(),
      phone: this.phone.trim(),
      line1: this.line1.trim(),
      line2: this.line2.trim() || null,
      city: this.city.trim(),
      region: this.region.trim(),
      isDefault: this.isDefault,
    });
  }
}
