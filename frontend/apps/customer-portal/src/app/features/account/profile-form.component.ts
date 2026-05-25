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
  CustomerProfile,
  DeliveryMethod,
  IdDocumentType,
  UpdateProfileRequest,
} from '../../models/customer-account.models';

@Component({
  selector: 'app-profile-form',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" (ngSubmit)="submit()">
      <div class="row2">
        <label>
          <span>First name</span>
          <input [(ngModel)]="firstName" name="firstName" required />
        </label>
        <label>
          <span>Last name</span>
          <input [(ngModel)]="lastName" name="lastName" required />
        </label>
      </div>

      <label>
        <span>Email</span>
        <input [value]="profile().email" disabled />
        <small>Email cannot be changed here.</small>
      </label>

      <label>
        <span>Phone</span>
        <input [(ngModel)]="phone" name="phone" required />
      </label>

      <label>
        <span>Destination country</span>
        <input [value]="profile().destinationCountryLabel" disabled />
      </label>

      <div class="row2">
        <label>
          <span>ID type</span>
          <select [(ngModel)]="idDocumentType" name="idType">
            <option value="NationalId">National ID</option>
            <option value="Passport">Passport</option>
          </select>
        </label>
        <label>
          <span>ID / Passport number</span>
          <input [(ngModel)]="idNumber" name="idNumber" required />
        </label>
      </div>

      <label>
        <span>Delivery</span>
        <input type="text" value="Pick up (PUDO)" disabled />
        <small>Shipments are collected at a partner pick-up point in Eswatini.</small>
      </label>

      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
      @if (saveError()) {
        <p class="err" role="alert">{{ saveError() }}</p>
      }
      @if (saveSuccess()) {
        <p class="save-ok" role="status">Profile saved.</p>
      }

      <div class="actions">
        <button type="button" class="bb-btn bb-btn-ghost" (click)="cancelled.emit()" [disabled]="saving()">
          Cancel
        </button>
        <button type="submit" class="bb-btn bb-btn-primary" [disabled]="saving() || !canSave()">
          <span class="material-icons-outlined">save</span>
          {{ saving() ? 'Saving…' : 'Save profile' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 0.85rem; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
    @media (max-width: 640px) { .row2 { grid-template-columns: 1fr; } }
    label { display: flex; flex-direction: column; gap: 0.3rem; }
    label span { font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); }
    label small { font-size: 0.72rem; color: var(--bb-muted); }
    input, select {
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      font-size: 0.88rem;
    }
    input:disabled { background: #f8fafc; color: var(--bb-muted); }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
    .err { color: #b91c1c; font-size: 0.85rem; margin: 0; }
    .save-ok {
      color: var(--bb-success);
      font-size: 0.85rem;
      font-weight: 600;
      margin: 0;
    }
    .actions .bb-btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .actions .material-icons-outlined {
      font-size: 1.1rem;
    }
  `,
})
export class ProfileFormComponent {
  readonly profile = input.required<CustomerProfile>();
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly saveSuccess = input(false);
  readonly saved = output<UpdateProfileRequest>();
  readonly cancelled = output<void>();

  firstName = '';
  lastName = '';
  phone = '';
  idNumber = '';
  idDocumentType: IdDocumentType = 'NationalId';
  deliveryMethod: DeliveryMethod = 'PUDO';
  error = signal<string | null>(null);

  private snapshot = '';

  constructor() {
    effect(() => {
      const p = this.profile();
      this.firstName = p.firstName;
      this.lastName = p.lastName;
      this.phone = p.phone;
      this.idNumber = p.idNumber;
      this.idDocumentType = p.idDocumentType;
      this.deliveryMethod = 'PUDO';
      this.snapshot = this.serialize();
    });
  }

  canSave(): boolean {
    return this.serialize() !== this.snapshot;
  }

  submit(): void {
    if (!this.firstName.trim() || !this.lastName.trim()) {
      this.error.set('First and last name are required.');
      return;
    }
    if (!this.phone.trim()) {
      this.error.set('Phone number is required.');
      return;
    }
    if (!this.idNumber.trim()) {
      this.error.set('ID or passport number is required.');
      return;
    }
    this.error.set(null);
    this.saved.emit({
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      idNumber: this.idNumber.trim(),
      idDocumentType: this.idDocumentType,
      preferredDeliveryMethod: 'PUDO',
    });
  }

  private serialize(): string {
    return JSON.stringify({
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      idNumber: this.idNumber.trim(),
      idDocumentType: this.idDocumentType,
      preferredDeliveryMethod: this.deliveryMethod,
    });
  }
}
