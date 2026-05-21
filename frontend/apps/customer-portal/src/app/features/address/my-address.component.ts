import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DeliveryAddressFormComponent } from '../account/delivery-address-form.component';
import { ProfileFormComponent } from '../account/profile-form.component';
import { MOCK_SUITE } from '../../data/borderbox-mock.data';
import type {
  DeliveryAddress,
  NotificationPreferences,
  UpsertDeliveryAddressRequest,
  UpdateProfileRequest,
} from '../../models/customer-account.models';
import { CustomerAccountService } from '../../services/customer-account.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-my-address',
  standalone: true,
  imports: [
    RouterLink,
    SuiteExpiredBannerComponent,
    ProfileFormComponent,
    DeliveryAddressFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="loading">Loading your account…</p>
    } @else {
      @if (account(); as acc) {
      <div class="bb-page-head">
        <h1>My Address &amp; Profile</h1>
        <p>Manage your South African suite address, Eswatini delivery details, and account profile.</p>
      </div>

      <app-suite-expired-banner />

      <nav class="tabs" aria-label="Account sections">
        <button type="button" [class.active]="tab() === 'profile'" (click)="tab.set('profile')">Profile</button>
        <button type="button" [class.active]="tab() === 'suite'" (click)="tab.set('suite')">SA suite address</button>
        <button type="button" [class.active]="tab() === 'delivery'" (click)="tab.set('delivery')">
          Delivery addresses
        </button>
      </nav>

      @if (tab() === 'profile') {
        <div class="grid">
          <section class="bb-card bb-card-pad span2">
            <div class="card-head">
              <h2 class="bb-card-title">Profile details</h2>
              @if (!editingProfile()) {
                <button type="button" class="bb-btn bb-btn-outline bb-btn-outline-sm" (click)="editingProfile.set(true)">
                  Edit profile
                </button>
              }
            </div>

            @if (editingProfile()) {
              <app-profile-form
                [profile]="acc.profile"
                [saving]="saving()"
                (saved)="onSaveProfile($event)"
                (cancelled)="editingProfile.set(false)"
              />
            } @else {
              <dl class="kv">
                <div><dt>Full name</dt><dd>{{ acc.profile.displayName }}</dd></div>
                <div><dt>Email</dt><dd>{{ acc.profile.email }}</dd></div>
                <div><dt>Phone</dt><dd>{{ acc.profile.phone }}</dd></div>
                <div><dt>Destination</dt><dd>🇸🇿 {{ acc.profile.destinationCountryLabel }}</dd></div>
                <div><dt>Delivery method</dt><dd>{{ acc.profile.preferredDeliveryMethod }}</dd></div>
                <div><dt>ID document</dt><dd>{{ acc.profile.idDocumentType === 'Passport' ? 'Passport' : 'National ID' }}</dd></div>
                <div><dt>ID number</dt><dd>{{ acc.profile.idNumber }}</dd></div>
                <div><dt>Member since</dt><dd>{{ acc.profile.memberSince }}</dd></div>
              </dl>
              <span class="bb-badge" [class]="kycClass(acc.profile.kycStatus)">
                KYC {{ kycLabel(acc.profile.kycStatus) }}
              </span>
            }
          </section>

          <section class="bb-card bb-card-pad">
            <h2 class="bb-card-title">Notification preferences</h2>
            @for (key of notifKeys; track key) {
              <label class="toggle-row">
                <div>
                  <strong>{{ notifLabel(key) }}</strong>
                  <span>{{ notifDesc(key) }}</span>
                </div>
                <input
                  type="checkbox"
                  [checked]="acc.notifications[key]"
                  (change)="toggleNotif(key, $any($event.target).checked)"
                />
              </label>
            }
            <button type="button" class="bb-btn bb-btn-primary" [disabled]="saving()" (click)="saveNotifications()">
              Save preferences
            </button>
          </section>
        </div>
      }

      @if (tab() === 'suite') {
        <section class="bb-card bb-card-pad suite-panel">
          <h2 class="bb-card-title">🇿🇦 Delivery address (South Africa)</h2>
          <p class="hint">Use this exact address when shopping at South African online stores.</p>

          @if (acc.suiteAddress; as suite) {
          <p class="suite-label">{{ suite.label }}</p>
          <p class="line"><strong>{{ suite.recipientName }}</strong></p>
          <p class="line">{{ suite.warehouseName }}</p>
          <p class="line">{{ suite.line1 }}</p>
          @if (suite.line2) {
            <p class="line">{{ suite.line2 }}</p>
          }
          <p class="line">
            {{ suite.city }}, {{ suite.province }} {{ suite.postalCode }}
          </p>
          <p class="line">{{ suite.country }}</p>

          <div class="suite-num">
            <span>Your suite number</span>
            <strong>{{ suite.suiteNumber }}</strong>
          </div>
          } @else {
            <p class="no-suite">You do not have an active suite yet. <a routerLink="/onboarding/choose-suite-plan">Choose a plan</a>.</p>
          }

          <button type="button" class="bb-btn bb-btn-outline" (click)="copySuite()">
            <span class="material-icons-outlined">content_copy</span>
            Copy full address
          </button>
          @if (copied()) {
            <p class="ok" role="status">Copied to clipboard</p>
          }

          <div class="info">
            <span class="material-icons-outlined">info</span>
            @if (acc.suiteAddress) {
              Always include suite <strong>{{ acc.suiteAddress.suiteNumber }}</strong> at checkout — parcels without it may be delayed.
            }
          </div>

          <div class="suite-meta bb-card bb-card-pad">
            <h3>Suite access</h3>
            <dl class="kv compact">
              <div><dt>Status</dt><dd class="danger">{{ suite.status }}</dd></div>
              <div><dt>Plan</dt><dd>{{ suite.plan }}</dd></div>
              <div><dt>Expired</dt><dd>{{ suite.expiredOn }}</dd></div>
            </dl>
            <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew suite access</a>
          </div>
        </section>
      }

      @if (tab() === 'delivery') {
        <div class="grid delivery-grid">
          <section class="bb-card bb-card-pad span2">
            <div class="card-head">
              <h2 class="bb-card-title">🇸🇿 Delivery addresses (Eswatini)</h2>
              @if (!editingAddress()) {
                <button type="button" class="bb-btn bb-btn-outline bb-btn-outline-sm" (click)="startAddAddress()">
                  Add address
                </button>
              }
            </div>
            <p class="hint">Where we deliver parcels after they leave our South African warehouse.</p>

            @if (editingAddress()) {
              <app-delivery-address-form
                [address]="addressBeingEdited()"
                [saving]="saving()"
                (saved)="onSaveAddress($event)"
                (cancelled)="cancelAddressEdit()"
              />
            } @else {
              <ul class="addr-list">
                @for (a of acc.deliveryAddresses; track a.id) {
                  <li [class.default]="a.isDefault">
                    <div class="addr-head">
                      <strong>{{ a.label }}</strong>
                      @if (a.isDefault) {
                        <span class="bb-badge bb-badge-info">Default</span>
                      }
                    </div>
                    <p>{{ a.fullName }} · {{ a.phone }}</p>
                    <p>{{ a.line1 }}@if (a.line2) {, {{ a.line2 }}}</p>
                    <p>{{ a.city }}, {{ a.region }}, {{ a.countryLabel }}</p>
                    <div class="addr-actions">
                      @if (!a.isDefault) {
                        <button type="button" class="bb-link-btn" (click)="setDefault(a.id)">Set default</button>
                      }
                      <button type="button" class="bb-link-btn" (click)="startEditAddress(a)">Edit</button>
                      @if (acc.deliveryAddresses.length > 1) {
                        <button type="button" class="bb-link-btn danger" (click)="removeAddress(a.id)">Remove</button>
                      }
                    </div>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      }

      @if (toast()) {
        <p class="toast" role="status">{{ toast() }}</p>
      }
      }
    }
  `,
  styles: `
    .loading { color: var(--bb-muted); }
    .tabs {
      display: flex;
      gap: 0.35rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .tabs button {
      padding: 0.5rem 1rem;
      border: 1px solid var(--bb-border);
      border-radius: 999px;
      background: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--bb-muted);
    }
    .tabs button.active {
      background: var(--bb-primary);
      border-color: var(--bb-primary);
      color: #fff;
    }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1.15rem; }
    .delivery-grid { grid-template-columns: 1fr; }
    .span2 { grid-column: span 1; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .hint { margin: 0 0 1rem; font-size: 0.85rem; color: var(--bb-muted); }
    .kv > div {
      display: grid;
      grid-template-columns: 140px 1fr;
      padding: 0.45rem 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.88rem;
    }
    .kv.compact > div { grid-template-columns: 100px 1fr; }
    .kv dt { color: var(--bb-muted); margin: 0; }
    .kv dd { margin: 0; font-weight: 600; }
    .kv .danger { color: var(--bb-danger); }
    .bb-badge-success { background: var(--bb-success-soft); color: #15803d; }
    .bb-badge-warning { background: var(--bb-warning-soft); color: #b45309; }
    .toggle-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.85rem;
    }
    .toggle-row span { display: block; font-size: 0.75rem; color: var(--bb-muted); font-weight: 400; }
    .suite-panel { max-width: 640px; }
    .suite-label { font-weight: 700; margin: 0 0 0.5rem; color: var(--bb-primary-deep); }
    .line { margin: 0 0 0.25rem; font-size: 0.9rem; color: #334155; }
    .suite-num {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      background: var(--bb-primary-soft);
      border-radius: var(--bb-radius-sm);
    }
    .suite-num strong { font-size: 1.25rem; color: var(--bb-primary-deep); }
    .ok { font-size: 0.8rem; color: var(--bb-success); margin: 0.35rem 0 0; }
    .info {
      display: flex;
      gap: 0.4rem;
      margin: 1rem 0;
      padding: 0.75rem;
      background: var(--bb-primary-soft);
      border-radius: var(--bb-radius-sm);
      font-size: 0.82rem;
      color: var(--bb-primary);
    }
    .suite-meta { margin-top: 1.5rem; background: #f8fafc; }
    .suite-meta h3 { margin: 0 0 0.75rem; font-size: 0.95rem; }
    .no-suite { color: var(--bb-muted); font-size: 0.9rem; }
    .no-suite a { color: var(--bb-primary); font-weight: 600; }
    .addr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .addr-list li {
      padding: 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fafbfc;
    }
    .addr-list li.default { border-color: var(--bb-primary); background: var(--bb-primary-soft); }
    .addr-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
    .addr-list p { margin: 0 0 0.2rem; font-size: 0.85rem; color: #475569; }
    .addr-actions { display: flex; gap: 0.75rem; margin-top: 0.65rem; }
    .bb-link-btn {
      border: none;
      background: none;
      padding: 0;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--bb-primary);
      cursor: pointer;
    }
    .bb-link-btn.danger { color: var(--bb-danger); }
    .toast {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      padding: 0.75rem 1.25rem;
      background: var(--bb-text);
      color: #fff;
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
      box-shadow: var(--bb-shadow-md);
      z-index: 50;
    }
  `,
})
export class MyAddressComponent implements OnInit {
  private readonly accountApi = inject(CustomerAccountService);
  private readonly route = inject(ActivatedRoute);

  readonly suite = MOCK_SUITE;
  readonly account = this.accountApi.account;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly tab = signal<'profile' | 'suite' | 'delivery'>('profile');
  readonly editingProfile = signal(false);
  readonly editingAddress = signal(false);
  readonly addressBeingEdited = signal<DeliveryAddress | null>(null);
  readonly copied = signal(false);
  readonly toast = signal<string | null>(null);

  readonly notifKeys = ['email', 'sms', 'whatsApp', 'marketing'] as const;

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'suite' || tab === 'delivery' || tab === 'profile') {
      this.tab.set(tab);
    }
    this.accountApi.loadAccount().subscribe({
      next: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
  }

  kycLabel(status: string): string {
    return this.accountApi.kycLabel(status);
  }

  kycClass(status: string): string {
    if (status === 'Verified') return 'bb-badge bb-badge-success';
    if (status === 'Pending') return 'bb-badge bb-badge-warning';
    return 'bb-badge bb-badge-danger';
  }

  notifLabel(key: (typeof this.notifKeys)[number]): string {
    const map = { email: 'Email', sms: 'SMS', whatsApp: 'WhatsApp', marketing: 'Marketing' };
    return map[key];
  }

  notifDesc(key: (typeof this.notifKeys)[number]): string {
    const map = {
      email: 'Parcel and shipment updates',
      sms: 'Delivery SMS alerts',
      whatsApp: 'Quick status on WhatsApp',
      marketing: 'Promotions and offers',
    };
    return map[key];
  }

  toggleNotif(key: (typeof this.notifKeys)[number], on: boolean): void {
    const acc = this.account();
    if (!acc) return;
    this.accountApi.account.set({
      ...acc,
      notifications: { ...acc.notifications, [key]: on },
    });
  }

  saveNotifications(): void {
    const acc = this.account();
    if (!acc) return;
    this.saving.set(true);
    this.accountApi.saveNotifications(acc.notifications).subscribe({
      next: () => {
        this.saving.set(false);
        this.showToast('Notification preferences saved');
      },
      error: () => this.saving.set(false),
    });
  }

  onSaveProfile(body: UpdateProfileRequest): void {
    this.saving.set(true);
    this.accountApi.updateProfile(body).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingProfile.set(false);
        this.showToast('Profile updated');
      },
      error: () => this.saving.set(false),
    });
  }

  copySuite(): void {
    this.accountApi.copySuiteAddress().subscribe((ok) => {
      this.copied.set(ok);
      if (ok) setTimeout(() => this.copied.set(false), 2500);
    });
  }

  startAddAddress(): void {
    this.addressBeingEdited.set(null);
    this.editingAddress.set(true);
  }

  startEditAddress(a: DeliveryAddress): void {
    this.addressBeingEdited.set(a);
    this.editingAddress.set(true);
  }

  cancelAddressEdit(): void {
    this.editingAddress.set(false);
    this.addressBeingEdited.set(null);
  }

  onSaveAddress(body: UpsertDeliveryAddressRequest): void {
    const id = this.addressBeingEdited()?.id ?? null;
    this.saving.set(true);
    this.accountApi.saveDeliveryAddress(id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelAddressEdit();
        this.showToast(id ? 'Address updated' : 'Address added');
      },
      error: () => this.saving.set(false),
    });
  }

  setDefault(id: string): void {
    this.accountApi.setDefaultDeliveryAddress(id).subscribe(() => {
      this.showToast('Default address updated');
    });
  }

  removeAddress(id: string): void {
    this.accountApi.deleteDeliveryAddress(id).subscribe(() => {
      this.showToast('Address removed');
    });
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2800);
  }
}
