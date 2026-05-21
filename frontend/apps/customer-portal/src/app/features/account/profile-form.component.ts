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
        <span>Preferred delivery method</span>
        <select [(ngModel)]="deliveryMethod" name="deliveryMethod">
          <option value="Door-to-Door">Door-to-Door</option>
          <option value="PUDO">PUDO (Pick up / drop off)</option>
        </select>
      </label>

      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }

      <div class="actions">
        <button type="button" class="bb-btn bb-btn-ghost" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" class="bb-btn bb-btn-primary" [disabled]="saving()">
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
  `,
})
export class ProfileFormComponent {
  readonly profile = input.required<CustomerProfile>();
  readonly saving = input(false);
  readonly saved = output<UpdateProfileRequest>();
  readonly cancelled = output<void>();

  firstName = '';
  lastName = '';
  phone = '';
  idNumber = '';
  idDocumentType: IdDocumentType = 'NationalId';
  deliveryMethod: DeliveryMethod = 'Door-to-Door';
  error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const p = this.profile();
      this.firstName = p.firstName;
      this.lastName = p.lastName;
      this.phone = p.phone;
      this.idNumber = p.idNumber;
      this.idDocumentType = p.idDocumentType;
      this.deliveryMethod = p.preferredDeliveryMethod;
    });
  }

  submit(): void {
    if (!this.firstName.trim() || !this.lastName.trim()) {
      this.error.set('First and last name are required.');
      return;
    }
    this.error.set(null);
    this.saved.emit({
      firstName: this.firstName,
      lastName: this.lastName,
      phone: this.phone,
      idNumber: this.idNumber,
      idDocumentType: this.idDocumentType,
      preferredDeliveryMethod: this.deliveryMethod,
    });
  }
}
