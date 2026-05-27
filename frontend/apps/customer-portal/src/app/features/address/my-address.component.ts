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
import { FormsModule } from '@angular/forms';
import { DeliveryAddressFormComponent } from '../account/delivery-address-form.component';
import { KycDocumentUploadComponent } from '../account/kyc-document-upload.component';
import { ProfileFormComponent } from '../account/profile-form.component';
import type {
  CustomerProfile,
  DeliveryAddress,
  NotificationPreferences,
  SuiteAddress,
  UpsertDeliveryAddressRequest,
  UpdateProfileRequest,
} from '../../models/customer-account.models';
import { isProfileComplete } from '../../models/customer-account.models';

function cloneNotifications(prefs: NotificationPreferences): NotificationPreferences {
  return { ...prefs };
}
import { PickupLocationCardComponent } from '@wayel/shared/components/pickup-location-card.component';
import { findPickupLocationConfig } from '@wayel/shared/pickup/pickup-regions.config';
import type { PickupLocationConfig } from '@wayel/shared/pickup/pickup-location.types';
import { enrichPickupLocation } from '@wayel/shared/pickup/pickup-location.utils';
import { environment } from '../../../environments/environment';
import {
  findPickupBranch,
  toPickupBranchSummary,
} from '../../data/eswatini-pickup-branches';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

type NotifKey = keyof NotificationPreferences;

@Component({
  selector: 'app-my-address',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    SuiteExpiredBannerComponent,
    ProfileFormComponent,
    DeliveryAddressFormComponent,
    KycDocumentUploadComponent,
    PickupLocationCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="loading">Loading your account…</p>
    } @else {
      @if (account(); as acc) {
      <div class="bb-page-head page-head">
        <h1>
          <span class="material-icons-outlined head-icon">verified_user</span>
          My Address &amp; Profile
        </h1>
        <p>Manage your South African suite address, Eswatini delivery details, and account profile.</p>
      </div>

      <app-suite-expired-banner />

      <nav class="tabs" aria-label="Account sections">
        <button type="button" [class.active]="tab() === 'profile'" (click)="tab.set('profile')">
          <span class="material-icons-outlined">person</span>
          Profile
        </button>
        <button type="button" [class.active]="tab() === 'suite'" (click)="tab.set('suite')">
          <span class="material-icons-outlined">apartment</span>
          SA suite address
        </button>
        <button type="button" [class.active]="tab() === 'delivery'" (click)="tab.set('delivery')">
          <span class="material-icons-outlined">location_on</span>
          Pickup branches
        </button>
      </nav>

      @if (tab() === 'profile') {
        <div class="profile-grid">
          <section class="bb-card bb-card-pad profile-card">
            <div class="card-head">
              <h2 class="bb-card-title">Profile details</h2>
              @if (!editingProfile()) {
                <button
                  type="button"
                  class="bb-btn bb-btn-outline bb-btn-outline-sm edit-btn"
                  (click)="startProfileEdit()"
                >
                  <span class="material-icons-outlined">edit</span>
                  Edit profile
                </button>
              }
            </div>

            @if (editingProfile()) {
              <app-profile-form
                [profile]="acc.profile"
                [saving]="saving()"
                [saveError]="profileSaveError()"
                [saveSuccess]="profileSaved()"
                (saved)="onSaveProfile($event)"
                (cancelled)="cancelProfileEdit()"
              />
            } @else {
              <div class="profile-body">
                <div class="avatar-wrap">
                  <span class="avatar" aria-hidden="true">{{ initials() }}</span>
                  <span class="avatar-status" title="Online"></span>
                </div>
                <ul class="profile-fields">
                  <li>
                    <span class="material-icons-outlined field-icon">badge</span>
                    <div>
                      <span class="field-label">Full name</span>
                      <span class="field-value">{{ acc.profile.displayName }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">mail</span>
                    <div>
                      <span class="field-label">Email</span>
                      <span class="field-value">{{ acc.profile.email }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">phone</span>
                    <div>
                      <span class="field-label">Phone</span>
                      <span class="field-value">{{ acc.profile.phone }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">public</span>
                    <div>
                      <span class="field-label">Destination</span>
                      <span class="field-value">🇸🇿 {{ acc.profile.destinationCountryLabel }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">local_shipping</span>
                    <div>
                      <span class="field-label">Delivery method</span>
                      <span class="field-value">{{ acc.profile.preferredDeliveryMethod }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">description</span>
                    <div>
                      <span class="field-label">ID document</span>
                      <span class="field-value">{{ acc.profile.idDocumentType === 'Passport' ? 'Passport' : 'National ID' }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">pin</span>
                    <div>
                      <span class="field-label">ID number</span>
                      <span class="field-value">{{ acc.profile.idNumber }}</span>
                    </div>
                  </li>
                  <li>
                    <span class="material-icons-outlined field-icon">event</span>
                    <div>
                      <span class="field-label">Member since</span>
                      <span class="field-value">{{ memberSinceLabel(acc.profile.memberSince) }}</span>
                    </div>
                  </li>
                </ul>
              </div>

              @if (kycIsPending(acc.profile.kycStatus)) {
                <div class="kyc-banner kyc-pending" role="status">
                  <span class="material-icons-outlined kyc-icon">hourglass_top</span>
                  <div class="kyc-text">
                    <strong>KYC {{ kycLabel(acc.profile.kycStatus) }}</strong>
                    — Your submission is under review. We will notify you when verification is
                    complete.
                  </div>
                </div>
              } @else if (kycIsRejected(acc.profile.kycStatus)) {
                <div class="kyc-banner" role="status">
                  <span class="material-icons-outlined kyc-icon">warning_amber</span>
                  <div class="kyc-text">
                    <strong>KYC {{ kycLabel(acc.profile.kycStatus) }}</strong>
                    — Your submission was not approved. Upload your documents again below.
                  </div>
                </div>
              } @else if (showKycBanner(acc.profile.kycStatus)) {
                <div class="kyc-banner" role="status">
                  <span class="material-icons-outlined kyc-icon">warning_amber</span>
                  <div class="kyc-text">
                    <strong>KYC {{ kycLabel(acc.profile.kycStatus) }}</strong>
                    — Upload your passport or national ID to unlock all account features.
                  </div>
                </div>
              } @else {
                <div class="kyc-banner kyc-ok" role="status">
                  <span class="material-icons-outlined kyc-icon">verified</span>
                  <div class="kyc-text">
                    <strong>KYC {{ kycLabel(acc.profile.kycStatus) }}</strong>
                    — Your identity verification is complete.
                  </div>
                </div>
              }

              @if (needsKycUpload(acc.profile.kycStatus)) {
                @if (isProfileComplete(acc.profile)) {
                  <section class="kyc-upload-panel">
                    <h3 class="kyc-upload-title">Upload your {{ idDocumentLabel(acc.profile) }}</h3>
                    <p class="kyc-upload-lead">
                      Take clear photos in good lighting. Make sure all text on your document is readable.
                    </p>
                    <app-kyc-document-upload #kycUpload [profile]="acc.profile" />
                    <label class="kyc-consent">
                      <input
                        type="checkbox"
                        [ngModel]="kycConfirmed()"
                        (ngModelChange)="kycConfirmed.set($event)"
                        name="kycConfirm"
                      />
                      <span>
                        I confirm these details are correct and I consent to identity verification for my
                        WeYell account.
                      </span>
                    </label>
                    @if (kycSubmitError()) {
                      <p class="kyc-submit-err" role="alert">{{ kycSubmitError() }}</p>
                    }
                    <button
                      type="button"
                      class="bb-btn bb-btn-primary kyc-submit-btn"
                      [disabled]="!kycConfirmed() || !kycUpload.allDocumentsUploaded() || kycSubmitting()"
                      (click)="submitKyc(kycUpload)"
                    >
                      {{ kycSubmitting() ? 'Submitting…' : 'Submit for verification' }}
                    </button>
                  </section>
                } @else {
                  <p class="kyc-profile-hint">
                    Complete your profile details first, then upload your ID documents.
                    <button type="button" class="bb-link-btn" (click)="startProfileEdit()">Edit profile</button>
                  </p>
                }
              }
            }
          </section>

          <section class="bb-card bb-card-pad notif-card">
            <div class="notif-head">
              <span class="material-icons-outlined notif-bell">notifications</span>
              <div>
                <h2 class="bb-card-title">Notification preferences</h2>
                <p class="notif-sub">Choose how you want to stay updated.</p>
              </div>
            </div>

            @for (row of notifRows; track row.key) {
              <label class="notif-row">
                <span class="material-icons-outlined notif-row-icon">{{ row.icon }}</span>
                <div class="notif-row-text">
                  <strong>{{ row.label }}</strong>
                  <span>{{ row.desc }}</span>
                </div>
                <input
                  type="checkbox"
                  class="notif-check"
                  [checked]="notificationPrefs()[row.key]"
                  (change)="toggleNotif(row.key, $any($event.target).checked)"
                />
              </label>
            }

            @if (prefsError()) {
              <p class="prefs-err" role="alert">{{ prefsError() }}</p>
            }
            @if (prefsSaved()) {
              <p class="prefs-ok" role="status">Preferences saved.</p>
            }

            <button
              type="button"
              class="bb-btn bb-btn-primary save-prefs"
              [disabled]="saving() || !prefsDirty()"
              (click)="saveNotifications()"
            >
              <span class="material-icons-outlined">lock</span>
              {{ saving() ? 'Saving…' : 'Save preferences' }}
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
          <p class="line">Suite {{ suite.suiteNumber }}</p>
          <p class="line">{{ suiteStreet(suite) }}</p>
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
              <div><dt>Status</dt><dd [class.danger]="suiteAccess().shipOutLocked">{{ suiteAccess().status }}</dd></div>
              @if (suiteExpiresLabel()) {
                <div><dt>Valid until</dt><dd>{{ suiteExpiresLabel() }}</dd></div>
              }
            </dl>
            <p class="hint">{{ suiteAccess().customerMessage }}</p>
            @if (suiteAccess().shipOutLocked) {
              <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary">Renew suite access</a>
            }
          </div>
        </section>
      }

      @if (tab() === 'delivery') {
        <div class="delivery-grid">
          <section class="bb-card bb-card-pad">
            <div class="card-head">
              <h2 class="bb-card-title">🇸🇿 Pickup branches (Eswatini)</h2>
              @if (!editingAddress()) {
                <button type="button" class="bb-btn bb-btn-outline bb-btn-outline-sm" (click)="startAddAddress()">
                  Add pickup branch
                </button>
              }
            </div>
            <p class="hint">
              Parcels are collected at WeYell branches in Eswatini — for example
              <strong>Mbabane New Mall</strong>. Choose your branch and who will collect.
            </p>

            @if (editingAddress()) {
              <app-delivery-address-form
                [address]="addressBeingEdited()"
                [saving]="saving()"
                (saved)="onSaveAddress($event)"
                (cancelled)="cancelAddressEdit()"
              />
            } @else {
              <ul class="addr-list pickup-list">
                @for (a of acc.deliveryAddresses; track a.id) {
                  <li [class.default]="a.isDefault">
                    <div class="addr-head">
                      <strong>{{ a.fullName }}</strong>
                      @if (a.isDefault) {
                        <span class="bb-badge bb-badge-info">Default</span>
                      }
                    </div>
                    @if (a.label && a.label !== a.branchName) {
                      <p class="addr-nick">{{ a.label }}</p>
                    }
                    <p class="collector-phone">{{ a.phone }}</p>
                    <nk-pickup-location-card
                      [location]="pickupLocationFor(a)"
                      [apiKey]="mapsApiKey"
                      [regionLabel]="'🇸🇿 Eswatini'"
                      [compact]="!a.isDefault"
                      [showMap]="a.isDefault"
                      [mapHeight]="200"
                    />
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

    .page-head h1 {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .head-icon {
      font-size: 1.35rem;
      color: var(--bb-primary);
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.35rem;
      flex-wrap: wrap;
    }
    .tabs button {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.55rem 1.1rem;
      border: 1px solid var(--bb-border);
      border-radius: 999px;
      background: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--bb-muted);
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .tabs button .material-icons-outlined {
      font-size: 1.05rem;
    }
    .tabs button:hover:not(.active) {
      border-color: #93c5fd;
      color: var(--bb-text);
    }
    .tabs button.active {
      background: var(--bb-primary);
      border-color: var(--bb-primary);
      color: #fff;
      box-shadow: 0 2px 8px rgba(0, 82, 204, 0.25);
    }
    .tabs button.active .material-icons-outlined {
      color: #fff;
    }

    .profile-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.65fr) minmax(280px, 1fr);
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 960px) {
      .profile-grid { grid-template-columns: 1fr; }
    }

    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.15rem;
    }
    .edit-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .edit-btn .material-icons-outlined {
      font-size: 1rem;
    }

    .profile-body {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }
    @media (max-width: 640px) {
      .profile-body { flex-direction: column; align-items: center; }
    }

    .avatar-wrap {
      position: relative;
      flex-shrink: 0;
    }
    .avatar {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #3b82f6, #1d4ed8);
      color: #fff;
      font-size: 1.65rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .avatar-status {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #22c55e;
      border: 2px solid #fff;
    }

    .profile-fields {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      min-width: 0;
    }
    .profile-fields li {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.55rem 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .profile-fields li:last-child {
      border-bottom: none;
    }
    .field-icon {
      font-size: 1.15rem !important;
      color: #94a3b8;
      margin-top: 0.1rem;
      flex-shrink: 0;
    }
    .field-label {
      display: block;
      font-size: 0.72rem;
      color: var(--bb-muted);
      font-weight: 500;
      margin-bottom: 0.1rem;
    }
    .field-value {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--bb-text);
      word-break: break-word;
    }

    .kyc-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem 1rem;
      margin-top: 1.25rem;
      padding: 0.85rem 1rem;
      border-radius: var(--bb-radius-sm);
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      font-size: 0.82rem;
      line-height: 1.45;
    }
    .kyc-banner.kyc-ok {
      background: #f0fdf4;
      border-color: #bbf7d0;
      color: #166534;
    }
    .kyc-banner.kyc-pending {
      background: #fffbeb;
      border-color: #fde68a;
      color: #92400e;
    }
    .kyc-icon {
      font-size: 1.35rem !important;
      flex-shrink: 0;
    }
    .kyc-text {
      flex: 1;
      min-width: 180px;
    }
    .kyc-text strong {
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-size: 0.75rem;
    }
    .kyc-btn {
      padding: 0.4rem 0.85rem;
      border: 1px solid #f87171;
      border-radius: var(--bb-radius-sm);
      background: #fff;
      color: #b91c1c;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .kyc-btn:hover {
      background: #fff1f2;
    }
    .kyc-upload-panel {
      margin-top: 1.25rem;
      padding: 1.1rem 1.15rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fafbfc;
    }
    .kyc-upload-title {
      margin: 0 0 0.35rem;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .kyc-upload-lead {
      margin: 0 0 1rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .kyc-consent {
      display: flex;
      gap: 0.55rem;
      align-items: flex-start;
      font-size: 0.82rem;
      color: var(--bb-text);
      line-height: 1.45;
      margin: 1rem 0 0.85rem;
      cursor: pointer;
    }
    .kyc-consent input {
      margin-top: 0.2rem;
      accent-color: var(--bb-primary);
      flex-shrink: 0;
    }
    .kyc-submit-btn { width: 100%; }
    .kyc-submit-err {
      margin: 0 0 0.65rem;
      font-size: 0.82rem;
      color: var(--bb-danger);
    }
    .kyc-profile-hint {
      margin: 1rem 0 0;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }

    .notif-card {
      display: flex;
      flex-direction: column;
    }
    .notif-head {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--bb-border);
    }
    .notif-bell {
      font-size: 1.75rem !important;
      color: var(--bb-primary);
      flex-shrink: 0;
    }
    .notif-head .bb-card-title {
      margin: 0;
    }
    .notif-sub {
      margin: 0.2rem 0 0;
      font-size: 0.78rem;
      color: var(--bb-muted);
    }

    .notif-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid #f1f5f9;
      cursor: pointer;
    }
    .notif-row:last-of-type {
      border-bottom: none;
      margin-bottom: 0.5rem;
    }
    .notif-row-icon {
      font-size: 1.2rem !important;
      color: #94a3b8;
      flex-shrink: 0;
    }
    .notif-row-text {
      flex: 1;
      min-width: 0;
    }
    .notif-row-text strong {
      display: block;
      font-size: 0.88rem;
      color: var(--bb-text);
    }
    .notif-row-text span {
      display: block;
      font-size: 0.75rem;
      color: var(--bb-muted);
      font-weight: 400;
      margin-top: 0.1rem;
    }
    .notif-check {
      width: 1.1rem;
      height: 1.1rem;
      accent-color: var(--bb-primary);
      flex-shrink: 0;
    }

    .save-prefs {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      width: 100%;
      margin-top: auto;
      padding: 0.85rem 1rem;
    }
    .save-prefs .material-icons-outlined {
      font-size: 1.1rem;
    }
    .prefs-err {
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
      color: var(--bb-danger);
    }
    .prefs-ok {
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
      color: var(--bb-success);
      font-weight: 600;
    }

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

    .suite-panel { max-width: 720px; }
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

    .delivery-grid { max-width: 800px; }
    .addr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .addr-list li {
      padding: 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fafbfc;
    }
    .addr-list li.default { border-color: var(--bb-primary); background: var(--bb-primary-soft); }
    .addr-head { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.35rem; }
    .addr-nick { font-size: 0.8rem; color: var(--bb-muted); font-style: italic; }
    .addr-list p { margin: 0 0 0.2rem; font-size: 0.85rem; color: #475569; }
    .pickup-list li { display: flex; flex-direction: column; gap: 0.65rem; }
    .collector-phone {
      margin: 0;
      font-size: 0.82rem;
      color: var(--bb-muted);
    }
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
  private readonly parcelsApi = inject(ParcelsService);
  private readonly route = inject(ActivatedRoute);

  readonly mapsApiKey = environment.googleMapsApiKey;

  readonly account = this.accountApi.account;
  readonly suiteAccess = computed(
    () =>
      this.parcelsApi.dashboard()?.suiteAccess ?? {
        status: 'Unknown',
        shipOutLocked: false,
        customerMessage: '',
        suiteNumber: null,
        expiresAt: null,
      },
  );
  readonly suiteExpiresLabel = computed(() => {
    const raw = this.suiteAccess().expiresAt;
    if (!raw) return null;
    return new Date(raw).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly tab = signal<'profile' | 'suite' | 'delivery'>('profile');
  readonly editingProfile = signal(false);
  readonly editingAddress = signal(false);
  readonly addressBeingEdited = signal<DeliveryAddress | null>(null);
  readonly copied = signal(false);
  readonly toast = signal<string | null>(null);
  readonly notificationPrefs = signal<NotificationPreferences>({
    email: true,
    sms: true,
    whatsApp: false,
    marketing: false,
  });
  readonly savedNotificationPrefs = signal<NotificationPreferences>({
    email: true,
    sms: true,
    whatsApp: false,
    marketing: false,
  });
  readonly prefsError = signal<string | null>(null);
  readonly prefsSaved = signal(false);
  readonly kycConfirmed = signal(false);
  readonly kycSubmitting = signal(false);
  readonly kycSubmitError = signal<string | null>(null);
  readonly profileSaveError = signal<string | null>(null);
  readonly profileSaved = signal(false);

  readonly notifRows: { key: NotifKey; label: string; desc: string; icon: string }[] = [
    { key: 'email', label: 'Email', desc: 'Parcel and shipment updates', icon: 'mail' },
    { key: 'sms', label: 'SMS', desc: 'Delivery SMS alerts', icon: 'sms' },
    { key: 'whatsApp', label: 'WhatsApp', desc: 'Quick status on WhatsApp', icon: 'chat' },
    { key: 'marketing', label: 'Marketing', desc: 'Promotions and offers', icon: 'campaign' },
  ];

  readonly initials = computed(() => {
    const p = this.account()?.profile;
    if (!p) return '??';
    const parts = p.displayName.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '??';
  });

  readonly prefsDirty = computed(() => {
    const current = this.notificationPrefs();
    const saved = this.savedNotificationPrefs();
    return (
      current.email !== saved.email ||
      current.sms !== saved.sms ||
      current.whatsApp !== saved.whatsApp ||
      current.marketing !== saved.marketing
    );
  });

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'suite' || tab === 'delivery' || tab === 'profile') {
      this.tab.set(tab);
    }
    this.accountApi.ensureAccountLoaded().subscribe({
      next: (acc) => {
        this.syncNotificationsFromAccount(acc.notifications);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.parcelsApi.loadDashboard().subscribe();
  }

  private syncNotificationsFromAccount(prefs: NotificationPreferences): void {
    const copy = cloneNotifications(prefs);
    this.notificationPrefs.set(copy);
    this.savedNotificationPrefs.set(cloneNotifications(prefs));
    this.prefsError.set(null);
    this.prefsSaved.set(false);
  }

  memberSinceLabel(raw: string): string {
    const d = Date.parse(raw);
    if (Number.isNaN(d)) return raw;
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  showKycBanner(status: string): boolean {
    return status === 'NotStarted' || status === 'Rejected';
  }

  kycIsPending(status: string): boolean {
    return status === 'Pending';
  }

  kycIsRejected(status: string): boolean {
    return status === 'Rejected';
  }

  readonly isProfileComplete = isProfileComplete;

  needsKycUpload(status: string): boolean {
    return this.showKycBanner(status) || this.kycIsRejected(status);
  }

  idDocumentLabel(profile: CustomerProfile): string {
    return profile.idDocumentType === 'Passport' ? 'passport' : 'national ID';
  }

  submitKyc(upload: KycDocumentUploadComponent): void {
    if (!this.kycConfirmed() || !upload.allDocumentsUploaded() || this.kycSubmitting()) return;
    this.kycSubmitting.set(true);
    this.kycSubmitError.set(null);
    this.accountApi.submitKyc().subscribe({
      next: () => {
        this.kycSubmitting.set(false);
        this.kycConfirmed.set(false);
        this.showToast('KYC submitted successfully');
      },
      error: (err: unknown) => {
        this.kycSubmitting.set(false);
        this.kycSubmitError.set(this.apiErrorMessage(err));
      },
    });
  }

  kycLabel(status: string): string {
    const label = this.accountApi.kycLabel(status);
    return status === 'NotStarted' ? 'NOT STARTED' : label.toUpperCase();
  }

  toggleNotif(key: NotifKey, on: boolean): void {
    this.notificationPrefs.update((p) => ({ ...p, [key]: on }));
    this.prefsSaved.set(false);
    this.prefsError.set(null);
  }

  saveNotifications(): void {
    const prefs = this.notificationPrefs();
    this.saving.set(true);
    this.prefsError.set(null);
    this.prefsSaved.set(false);
    this.accountApi.saveNotifications(prefs).subscribe({
      next: (acc) => {
        this.saving.set(false);
        this.syncNotificationsFromAccount(acc.notifications);
        this.prefsSaved.set(true);
        this.showToast('Notification preferences saved');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.prefsError.set(this.apiErrorMessage(err));
      },
    });
  }

  startProfileEdit(): void {
    this.profileSaveError.set(null);
    this.profileSaved.set(false);
    this.editingProfile.set(true);
  }

  cancelProfileEdit(): void {
    this.profileSaveError.set(null);
    this.profileSaved.set(false);
    this.editingProfile.set(false);
  }

  onSaveProfile(body: UpdateProfileRequest): void {
    this.saving.set(true);
    this.profileSaveError.set(null);
    this.profileSaved.set(false);
    this.accountApi.updateProfile(body).subscribe({
      next: () => {
        this.saving.set(false);
        this.profileSaved.set(true);
        this.editingProfile.set(false);
        this.showToast('Profile saved to your account');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.profileSaveError.set(this.apiErrorMessage(err));
      },
    });
  }

  copySuite(): void {
    this.accountApi.copySuiteAddress().subscribe((ok) => {
      this.copied.set(ok);
      if (ok) setTimeout(() => this.copied.set(false), 2500);
    });
  }

  suiteStreet(suite: SuiteAddress): string {
    return suite.line2?.trim() ? `${suite.line1}, ${suite.line2}` : suite.line1;
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

  pickupLocationFor(address: DeliveryAddress): PickupLocationConfig {
    const known = findPickupBranch(address.branchId);
    const summary = known
      ? toPickupBranchSummary(known)
      : {
          id: address.branchId,
          name: address.branchName || address.label,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          region: address.region,
          description: '',
        };
    return enrichPickupLocation(
      summary,
      'eswatini',
      findPickupLocationConfig('eswatini', address.branchId),
    );
  }

  private apiErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | string | null;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object') {
        return body.detail ?? body.title ?? 'Could not save preferences. Try again.';
      }
      if (err.status === 400) return 'Invalid preferences. Check your selections and try again.';
      if (err.status === 403) return 'You are not allowed to update preferences.';
    }
    if (err instanceof Error && err.message) return err.message;
    return 'Could not save preferences. Try again.';
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2800);
  }
}
