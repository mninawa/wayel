import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { DeliveryAddress, UpsertDeliveryAddressRequest } from '../../models/customer-account.models';
import type { ParcelListItem } from '../../models/parcel.models';
import { formatParcelReference, isQuoteEligibleParcel } from '../../models/parcel.models';
import {
  BorderboxApiService,
  type QuoteBreakdownLineDto,
  type SuitePlanDto,
} from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { DeliveryAddressFormComponent } from '../account/delivery-address-form.component';

/** WeYell ship-out is pick-up (PUDO) only — no door-to-door. */
type DeliveryMethodChoice = 'PUDO';

type FlowStepStatus = 'pending' | 'active' | 'done';

interface FlowStep {
  id: number;
  label: string;
  status: FlowStepStatus;
}

interface RenewPlanOption {
  id: string;
  priceZar: number;
  months: number;
  title: string;
  subtitle: string;
  popular?: boolean;
}

const PICKUP_METHOD: DeliveryMethodChoice = 'PUDO';

@Component({
  selector: 'app-create-shipment',
  standalone: true,
  imports: [RouterLink, DecimalPipe, FormsModule, DeliveryAddressFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shipOutLocked()) {
      <div class="locked-banner">
        <span class="bb-badge bb-badge-danger">Suite access expired</span>
        <p>Renew suite access to request a quote and ship out.</p>
      </div>
    }

    @if (loadError()) {
      <p class="err">{{ loadError() }}</p>
    } @else {
      <div class="kanban-flow">
        <nav class="flow-rail" aria-label="Shipment steps">
          @for (step of flowSteps(); track step.id; let last = $last) {
            <div
              class="rail-step"
              [class.rail-step--done]="step.status === 'done'"
              [class.rail-step--active]="step.status === 'active'"
            >
              <span class="rail-marker">
                @if (step.status === 'done') {
                  <span class="material-icons-outlined">check</span>
                } @else {
                  {{ step.id }}
                }
              </span>
              <span class="rail-label">{{ step.label }}</span>
            </div>
            @if (!last) {
              <span class="rail-connector" [class.rail-connector--done]="step.status === 'done'"></span>
            }
          }
        </nav>

        <div class="kanban-board" role="list">
          <!-- Column 1: Parcels -->
          <article
            class="kanban-col"
            role="listitem"
            [class.kanban-col--done]="stepParcelsDone()"
            [class.kanban-col--active]="!stepParcelsDone()"
          >
            <header class="col-head">
              <div class="col-head-top">
                <span class="col-num">1</span>
                <h2>Select parcels</h2>
              </div>
              <span class="col-status">{{ stepParcelsDone() ? 'Done' : 'In progress' }}</span>
            </header>
            <div class="col-body">
              <p class="col-meta">
                <strong>{{ selectedCount() }}</strong> selected ·
                <strong>{{ totalWeight() | number:'1.1-1' }} kg</strong>
                @if (selectedGoodsValue() > 0) {
                  · goods <strong>R{{ selectedGoodsValue() | number:'1.2-2' }}</strong>
                }
              </p>
              @if (quoteEligibleParcels().length > 1) {
                <div class="pick-toolbar">
                  <button type="button" class="link-btn" (click)="selectAllEligible()">Select all</button>
                  <button type="button" class="link-btn" (click)="clearSelection()">Clear</button>
                </div>
              }
              <ul class="parcel-picks">
                @for (p of quoteEligibleParcels(); track p.id) {
                  <li>
                    <label class="pick-row">
                      <input
                        type="checkbox"
                        [checked]="isSelected(p.id)"
                        (change)="toggleParcel(p.id)"
                      />
                      <div class="pick-body">
                        <div class="pick-top">
                          <span class="item">{{ p.itemName }}</span>
                          @if (p.declaredValueZar != null && p.declaredValueZar > 0) {
                            <span class="item-price">R{{ p.declaredValueZar | number:'1.2-2' }}</span>
                          }
                        </div>
                        <div class="pick-ids">
                          <span class="mono ref">{{ parcelRef(p.id) }}</span>
                          @if (p.trackingNumber) {
                            <span class="tracking">{{ p.trackingNumber }}</span>
                          }
                        </div>
                      </div>
                    </label>
                  </li>
                } @empty {
                  <li class="empty">
                    No parcels are ready for a quote yet. Complete invoice upload and wait for
                    warehouse processing, or check
                    <a routerLink="/received-parcels">received parcels</a>.
                  </li>
                }
              </ul>
              @if (blockedParcels().length > 0) {
                <details class="blocked-details">
                  <summary class="blocked-heading">
                    <span class="blocked-heading-text">Not available for quote</span>
                    <span class="blocked-count">{{ blockedParcels().length }}</span>
                    <span class="material-icons-outlined blocked-chevron" aria-hidden="true">expand_more</span>
                  </summary>
                  <ul class="parcel-blocked">
                    @for (p of blockedParcels(); track p.id) {
                      <li class="blocked-row">
                        <div class="blocked-main">
                          <span class="item">{{ p.itemName }}</span>
                          <div class="pick-ids">
                            <span class="mono ref">{{ parcelRef(p.id) }}</span>
                            @if (p.trackingNumber) {
                              <span class="tracking">{{ p.trackingNumber }}</span>
                            }
                          </div>
                        </div>
                        <span class="blocker-pill">{{ blockerLabel(p) }}</span>
                      </li>
                    }
                  </ul>
                </details>
              }
            </div>
          </article>

          <span class="col-arrow material-icons-outlined" aria-hidden="true">arrow_forward</span>

          <!-- Column 2: Address -->
          <article
            class="kanban-col"
            role="listitem"
            [class.kanban-col--done]="stepAddressDone()"
            [class.kanban-col--active]="stepParcelsDone() && !stepAddressDone()"
          >
            <header class="col-head">
              <div class="col-head-top">
                <span class="col-num">2</span>
                <h2>Delivery address</h2>
              </div>
              <span class="col-status">{{ stepAddressDone() ? 'Done' : 'In progress' }}</span>
            </header>
            <div class="col-body">
              <div class="addr-toolbar">
                <label class="addr-select-wrap">
                  <span class="sr-only">Select address</span>
                  <select
                    class="addr-select"
                    [ngModel]="selectedAddressId()"
                    (ngModelChange)="selectedAddressId.set($event)"
                    name="addressId"
                  >
                    @for (a of deliveryAddresses(); track a.id) {
                      <option [value]="a.id">
                        {{ a.label || a.branchName }}{{ a.isDefault ? ' (Default)' : '' }}
                      </option>
                    }
                  </select>
                </label>
                <button type="button" class="addr-add" (click)="openAddressDrawer()">Add new</button>
              </div>
              @if (selectedAddress(); as addr) {
                <div class="addr-fields">
                  <label>
                    <span>Full name</span>
                    <input type="text" [value]="addr.fullName" readonly />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input type="text" [value]="addr.phone" readonly />
                  </label>
                  <label>
                    <span>City</span>
                    <input type="text" [value]="addr.city" readonly />
                  </label>
                </div>
              } @else {
                <p class="addr-empty">
                  <button type="button" class="addr-add inline" (click)="openAddressDrawer()">Add an address</button> to continue.
                </p>
              }
            </div>
          </article>

          <span class="col-arrow material-icons-outlined" aria-hidden="true">arrow_forward</span>

          <!-- Column 3: Pay -->
          <article
            class="kanban-col kanban-col--pay"
            role="listitem"
            [class.kanban-col--active]="stepPayReady()"
            [class.kanban-col--waiting]="stepAddressDone() && !stepPayReady()"
          >
            <header class="col-head">
              <div class="col-head-top">
                <span class="col-num">3</span>
                <h2>Review &amp; pay</h2>
              </div>
              <span class="col-status">{{ payStepStatusLabel() }}</span>
            </header>
            <div class="col-body">
              <dl class="summary-kv">
                <div><dt>Parcels</dt><dd>{{ selectedCount() }}</dd></div>
                <div><dt>Weight</dt><dd>{{ totalWeight() | number:'1.1-1' }} kg</dd></div>
                @if (selectedAddress(); as addr) {
                  <div><dt>To</dt><dd>{{ addr.city }}</dd></div>
                }
                @if (declaredGoodsValue() != null && declaredGoodsValue()! > 0) {
                  <div class="declared-row">
                    <dt>Goods (paid to retailer)</dt>
                    <dd>R{{ declaredGoodsValue()! | number:'1.2-2' }}</dd>
                  </div>
                }
              </dl>
              @if (landedCostBreakdown().length > 0) {
                <div class="cost-breakdown">
                  <h3 class="cost-breakdown-title">Cost breakdown</h3>
                  <ul class="breakdown-lines">
                    @for (line of landedCostBreakdown(); track line.label) {
                      <li [class.breakdown-line--info]="line.includedInTotal === false">
                        <span class="breakdown-label">
                          {{ line.label }}
                          @if (line.includedInTotal === false) {
                            <span class="breakdown-tag">not in total</span>
                          }
                        </span>
                        <span class="breakdown-amt">R{{ line.amount | number:'1.2-2' }}</span>
                      </li>
                    }
                  </ul>
                </div>
              } @else if (estimatingCost()) {
                <p class="cost-loading">Calculating cost…</p>
              }
              <div class="summary-total">
                <span>Total to pay</span>
                <strong>@if (landedCostEstimate() != null) {
                  R{{ landedCostEstimate()! | number:'1.2-2' }}
                } @else { — }</strong>
                <small class="summary-hint">
                  @if (dutyCharged()) {
                    Duty to Eswatini
                  } @else {
                    No duty (no item &gt; R{{ dutyThresholdZar() | number:'1.0-0' }})
                  }
                  @if (vatCharged()) {
                    · 25% BorderBox take (15% VAT + 10% fees)
                  }
                  · fees on declared goods — not retailer price
                </small>
              </div>
              @if (submitError()) {
                <p class="lock-note" role="alert">{{ submitError() }}</p>
              }
              <button
                type="button"
                class="bb-btn bb-btn-primary pay-btn"
                [disabled]="!canSubmit() || submitting()"
                (click)="submit()"
              >
                @if (shipOutLocked()) {
                  <span class="material-icons-outlined">lock</span>
                }
                Continue to Payment
              </button>
              @if (shipOutLocked()) {
                <p class="lock-note">Renew suite access to continue.</p>
              }
            </div>
          </article>
        </div>
      </div>
    }

    @if (addressDrawerOpen()) {
      <div class="drawer-backdrop" (click)="closeAddressDrawer()" aria-hidden="true"></div>
      <aside
        class="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-drawer-title"
        (click)="$event.stopPropagation()"
      >
        <header class="drawer-head">
          <div>
            <h2 id="address-drawer-title">Add pickup branch</h2>
            <p>Choose where you will collect your parcel in Eswatini.</p>
          </div>
          <button type="button" class="drawer-close" (click)="closeAddressDrawer()" aria-label="Close">
            <span class="material-icons-outlined">close</span>
          </button>
        </header>
        <div class="drawer-body">
          <app-delivery-address-form
            [address]="null"
            [saving]="addressSaving()"
            (saved)="onSaveAddressFromDrawer($event)"
            (cancelled)="closeAddressDrawer()"
          />
        </div>
      </aside>
    }

    @if (showModal()) {
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="lock-modal-title">
        <div class="modal-panel" (click)="$event.stopPropagation()">
          <button type="button" class="modal-close" (click)="showModal.set(false)" aria-label="Close">
            <span class="material-icons-outlined">close</span>
          </button>
          <div class="modal-head">
            <span class="material-icons-outlined lock-icon">lock</span>
            <h2 id="lock-modal-title">Ship-out locked — Renew your suite access to continue.</h2>
          </div>
          <div class="modal-alert" role="status">
            <span class="material-icons-outlined">info</span>
            <p>
              Your suite <strong>{{ suiteNumber() }}</strong> is still reserved, but parcels cannot
              be couriered until your suite fee is paid.
            </p>
          </div>
          <div class="renew-options">
            @for (plan of renewPlans(); track plan.id) {
              <label class="renew-card" [class.selected]="selectedRenewPlanId() === plan.id">
                <input
                  type="radio"
                  name="renewPlan"
                  [value]="plan.id"
                  [checked]="selectedRenewPlanId() === plan.id"
                  (change)="selectedRenewPlanId.set(plan.id)"
                />
                <div class="renew-body">
                  <div class="renew-top">
                    <strong>R{{ plan.priceZar }} / {{ plan.months }} Month{{ plan.months > 1 ? 's' : '' }}</strong>
                    @if (plan.popular) {
                      <span class="tag-popular">Most popular</span>
                    }
                  </div>
                  <p>{{ plan.subtitle }}</p>
                </div>
              </label>
            }
          </div>
          <div class="modal-trust">
            <span><span class="material-icons-outlined">verified_user</span> Secure checkout</span>
            <span><span class="material-icons-outlined">bolt</span> Instant access</span>
            <span><span class="material-icons-outlined">event_busy</span> Cancel anytime</span>
          </div>
          <button type="button" class="bb-btn bb-btn-primary modal-cta" (click)="goToRenewCheckout()">
            Renew &amp; continue
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .locked-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem 1rem;
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      border-radius: var(--bb-radius-sm);
      background: var(--bb-danger-soft);
      border: 1px solid var(--bb-danger-border);
    }
    .locked-banner p { margin: 0; font-size: 0.82rem; color: #991b1b; flex: 1; min-width: 12rem; }

    .kanban-flow { display: flex; flex-direction: column; gap: 1rem; }

    .flow-rail {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0.75rem 1rem;
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow);
      overflow-x: auto;
    }
    .rail-step {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      flex-shrink: 0;
      color: var(--bb-muted);
      font-size: 0.78rem;
      font-weight: 600;
    }
    .rail-step--active { color: var(--bb-primary); }
    .rail-step--done { color: #15803d; }
    .rail-marker {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 999px;
      border: 2px solid currentColor;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.68rem;
      font-weight: 700;
      background: #fff;
    }
    .rail-step--active .rail-marker {
      background: var(--bb-primary-soft);
      border-color: var(--bb-primary);
    }
    .rail-step--done .rail-marker {
      background: #ecfdf3;
      border-color: #15803d;
    }
    .rail-marker .material-icons-outlined { font-size: 14px !important; }
    .rail-connector {
      flex: 1;
      min-width: 1.5rem;
      max-width: 3rem;
      height: 2px;
      background: #e2e8f0;
      margin: 0 0.5rem;
    }
    .rail-connector--done { background: #86efac; }

    .kanban-board {
      display: flex;
      align-items: stretch;
      gap: 0;
      padding: 1rem;
      background: #f1f5f9;
      border-radius: var(--bb-radius);
      border: 1px solid #e2e8f0;
      overflow-x: auto;
      scroll-snap-type: x proximity;
      min-height: 420px;
    }
    .kanban-col {
      flex: 1 1 240px;
      min-width: 220px;
      max-width: 280px;
      display: flex;
      flex-direction: column;
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      box-shadow: var(--bb-shadow);
      scroll-snap-align: start;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .kanban-col--active {
      border-color: var(--bb-primary);
      box-shadow: 0 0 0 2px var(--bb-primary-soft), var(--bb-shadow-md);
    }
    .kanban-col--done {
      border-color: #bbf7d0;
    }
    .kanban-col--pay {
      flex: 1.15 1 260px;
      max-width: 300px;
      background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
    }
    .kanban-col--pay.kanban-col--active {
      border-color: #15803d;
      box-shadow: 0 0 0 2px #ecfdf3, var(--bb-shadow-md);
    }
    .col-arrow {
      flex: 0 0 auto;
      align-self: center;
      color: #cbd5e1;
      font-size: 22px !important;
      margin: 0 0.15rem;
    }
    .col-head {
      padding: 0.75rem 0.85rem;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
      background: #fafbfc;
      border-radius: var(--bb-radius-sm) var(--bb-radius-sm) 0 0;
    }
    .col-head-top {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
    }
    .col-head h2 {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--bb-text);
      line-height: 1.2;
    }
    .col-num {
      width: 1.25rem;
      height: 1.25rem;
      border-radius: 6px;
      background: var(--bb-primary-soft);
      color: var(--bb-primary);
      font-size: 0.68rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kanban-col--done .col-num {
      background: #ecfdf3;
      color: #15803d;
    }
    .col-status {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: #f1f5f9;
      color: var(--bb-muted);
      white-space: nowrap;
    }
    .kanban-col--active .col-status {
      background: var(--bb-primary-soft);
      color: var(--bb-primary);
    }
    .kanban-col--done .col-status {
      background: #ecfdf3;
      color: #15803d;
    }
    .kanban-col--pay.kanban-col--active .col-status {
      background: var(--bb-primary-soft);
      color: var(--bb-primary);
    }
    .kanban-col--pay.kanban-col--waiting .col-status {
      background: #fffbeb;
      color: #b45309;
    }
    .col-body {
      flex: 1;
      padding: 0.75rem 0.85rem 0.85rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      min-height: 0;
    }
    .col-meta {
      margin: 0;
      font-size: 0.75rem;
      color: var(--bb-muted);
    }
    .col-meta strong { color: var(--bb-text); }
    .parcel-picks {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      min-height: 120px;
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid #f1f5f9;
      border-radius: var(--bb-radius-sm);
    }
    .parcel-picks li { border-bottom: 1px solid #f1f5f9; }
    .parcel-picks li:last-child { border-bottom: none; }
    .pick-toolbar {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 0.15rem;
    }
    .pick-toolbar .link-btn {
      background: none;
      border: none;
      padding: 0;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--bb-primary);
      cursor: pointer;
    }
    .pick-row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem;
      align-items: start;
      padding: 0.6rem 0.75rem;
      font-size: 0.82rem;
      cursor: pointer;
      margin: 0;
    }
    .pick-row:hover { background: #f8fafc; }
    .pick-row input {
      accent-color: var(--bb-primary);
      grid-row: 1 / span 2;
      margin-top: 0.2rem;
    }
    .pick-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .pick-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .pick-top .item {
      color: var(--bb-text);
      font-size: 0.82rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .pick-top .item-price {
      flex-shrink: 0;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--bb-muted);
      white-space: nowrap;
    }
    .pick-ids {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
    }
    .pick-ids .ref {
      color: var(--bb-primary);
      font-weight: 600;
      font-size: 0.68rem;
    }
    .pick-ids .tracking {
      font-size: 0.68rem;
      color: var(--bb-muted);
      font-family: ui-monospace, monospace;
      word-break: break-all;
    }
    .parcel-picks .empty {
      padding: 1rem;
      color: var(--bb-muted);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .blocked-details {
      margin-top: 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: var(--bb-radius-sm);
      background: #fafbfc;
      overflow: hidden;
    }
    .blocked-heading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.75rem;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--bb-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      list-style: none;
      user-select: none;
    }
    .blocked-heading-text { flex: 1; min-width: 0; }
    .blocked-heading::-webkit-details-marker { display: none; }
    .blocked-chevron {
      font-size: 1.15rem !important;
      color: var(--bb-muted);
      transition: transform 0.15s ease;
    }
    .blocked-details[open] .blocked-chevron {
      transform: rotate(180deg);
    }
    .blocked-count {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
      background: #e2e8f0;
      color: var(--bb-text);
      letter-spacing: 0;
      text-transform: none;
    }
    .parcel-blocked {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 200px;
      overflow-y: auto;
      border-top: 1px solid #e2e8f0;
    }
    .blocked-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.65rem 0.75rem;
      font-size: 0.78rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .blocked-row:last-child { border-bottom: none; }
    .blocked-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .blocked-main .item {
      color: var(--bb-text);
      font-size: 0.8rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .blocked-main .pick-ids {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.5rem;
    }
    .blocked-main .ref {
      color: var(--bb-muted);
      font-weight: 600;
      font-size: 0.68rem;
    }
    .blocked-main .tracking {
      font-size: 0.68rem;
      color: var(--bb-muted);
      font-family: ui-monospace, monospace;
      word-break: break-all;
    }
    .blocker-pill {
      flex-shrink: 0;
      align-self: center;
      max-width: 7.5rem;
      padding: 0.25rem 0.5rem;
      border-radius: 999px;
      font-size: 0.65rem;
      font-weight: 600;
      line-height: 1.25;
      text-align: center;
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }

    .method-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.35rem 0.5rem;
      align-items: start;
      padding: 0.65rem 0.7rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      margin-bottom: 0.45rem;
      cursor: pointer;
      background: #fff;
    }
    .method-card:last-child { margin-bottom: 0; }
    .method-card input { grid-row: 1 / span 2; margin-top: 0.1rem; }
    .method-price { grid-column: 2; font-weight: 700; font-size: 0.8rem; color: var(--bb-text); }
    .method-card.selected {
      border-color: var(--bb-primary);
      background: var(--bb-primary-soft);
      box-shadow: 0 0 0 1px var(--bb-primary);
    }
    .method-card input { accent-color: var(--bb-primary); }
    .method-head { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
    .method-head strong { font-size: 0.88rem; color: var(--bb-text); }
    .tag-rec {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.12rem 0.4rem;
      border-radius: 4px;
      background: #ecfdf3;
      color: #15803d;
    }
    .method-eta { display: block; font-size: 0.72rem; color: var(--bb-muted); margin-top: 0.1rem; }
    .method-card--solo {
      cursor: default;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .method-card--solo .method-price { grid-column: unset; white-space: nowrap; }
    .method-desc { font-size: 0.72rem; color: var(--bb-muted); margin: 0.35rem 0 0; line-height: 1.35; }

    .addr-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      margin-bottom: 0.85rem;
    }
    .addr-select-wrap { flex: 1; min-width: 12rem; }
    .addr-select {
      width: 100%;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      padding: 0.5rem 0.65rem;
      font-size: 0.85rem;
      background: #fff;
      color: var(--bb-text);
    }
    .addr-add {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--bb-primary);
      text-decoration: none;
      white-space: nowrap;
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
    }
    .addr-add:hover { text-decoration: underline; }
    .addr-add.inline { display: inline; }
    .addr-fields {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .addr-fields label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--bb-muted);
    }
    .addr-fields input {
      font-weight: 500;
      color: var(--bb-text);
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      padding: 0.45rem 0.55rem;
      font-size: 0.85rem;
      background: #f8fafc;
    }
    .addr-empty { font-size: 0.82rem; color: var(--bb-muted); margin: 0; }
    .addr-empty a { color: var(--bb-primary); font-weight: 600; }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }

    .summary-kv { margin: 0; flex: 1; }
    .summary-kv > div {
      display: flex;
      justify-content: space-between;
      padding: 0.4rem 0;
      font-size: 0.85rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .summary-kv dt { margin: 0; color: var(--bb-muted); font-weight: 500; }
    .summary-kv dd { margin: 0; font-weight: 600; color: var(--bb-text); }
    .declared-row dt { color: var(--bb-muted); }
    .declared-row dd { color: var(--bb-muted); font-weight: 500; font-size: 0.8rem; }
    .cost-breakdown {
      margin-top: 0.5rem;
      padding: 0.55rem 0.6rem;
      background: #f8fafc;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .cost-breakdown-title {
      margin: 0 0 0.4rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--bb-muted);
    }
    .breakdown-lines {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 9rem;
      overflow-y: auto;
    }
    .breakdown-lines li {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.3rem 0;
      font-size: 0.78rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .breakdown-lines li:last-child { border-bottom: none; }
    .breakdown-label { color: var(--bb-text); flex: 1; min-width: 0; }
    .breakdown-amt { font-weight: 600; color: var(--bb-text); white-space: nowrap; }
    .breakdown-line--info { background: #f8fafc; }
    .breakdown-line--info .breakdown-label { color: var(--bb-muted); font-style: italic; }
    .breakdown-line--info .breakdown-amt { color: var(--bb-muted); font-weight: 500; }
    .breakdown-tag {
      display: inline-block;
      margin-left: 0.35rem;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--bb-muted);
      font-style: normal;
    }
    .cost-loading {
      margin: 0.5rem 0 0;
      font-size: 0.78rem;
      color: var(--bb-muted);
      text-align: center;
    }
    .summary-total {
      padding: 0.65rem 0.7rem;
      background: var(--bb-success-soft);
      border-radius: var(--bb-radius-sm);
      text-align: center;
      margin-top: 0.5rem;
    }
    .summary-total span { font-size: 0.72rem; color: var(--bb-muted); font-weight: 600; display: block; }
    .summary-total strong { font-size: 1.35rem; font-weight: 700; color: #15803d; display: block; }
    .summary-hint {
      display: block;
      font-size: 0.72rem;
      color: var(--bb-muted);
      font-weight: 500;
      margin-top: 0.2rem;
    }
    .pay-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
    }
    .pay-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .lock-note { font-size: 0.72rem; color: var(--bb-danger); margin: 0; text-align: center; }
    .err { color: var(--bb-danger); font-size: 0.85rem; }

    @media (max-width: 1100px) {
      .col-arrow { display: none; }
      .kanban-board { gap: 0.65rem; padding: 0.75rem; }
      .kanban-col { min-width: 260px; }
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 1.25rem;
    }
    .modal-panel {
      position: relative;
      max-width: 520px;
      width: 100%;
      background: var(--bb-surface);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      padding: 1.75rem 1.75rem 1.5rem;
      border: 1px solid var(--bb-border);
    }
    .modal-close {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      border: none;
      background: transparent;
      color: var(--bb-muted);
      cursor: pointer;
      padding: 0.25rem;
      line-height: 0;
    }
    .modal-head { text-align: center; margin-bottom: 1rem; }
    .lock-icon {
      font-size: 2.5rem !important;
      color: var(--bb-danger);
      display: block;
      margin: 0 auto 0.5rem;
    }
    .modal-head h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--bb-text);
      line-height: 1.35;
    }
    .modal-alert {
      display: flex;
      gap: 0.55rem;
      align-items: flex-start;
      padding: 0.75rem 0.85rem;
      border-radius: var(--bb-radius-sm);
      background: #fef2f2;
      border: 1px solid #fecaca;
      margin-bottom: 1rem;
      font-size: 0.82rem;
      color: #991b1b;
    }
    .modal-alert .material-icons-outlined { font-size: 20px !important; flex-shrink: 0; }
    .modal-alert p { margin: 0; line-height: 1.45; }
    .renew-options { display: flex; flex-direction: column; gap: 0.55rem; margin-bottom: 1rem; }
    .renew-card {
      display: flex;
      gap: 0.65rem;
      padding: 0.9rem 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      cursor: pointer;
      background: #fff;
    }
    .renew-card.selected {
      border-color: var(--bb-primary);
      background: var(--bb-primary-soft);
      box-shadow: 0 0 0 1px var(--bb-primary);
    }
    .renew-card input { accent-color: var(--bb-primary); margin-top: 0.2rem; }
    .renew-top {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.2rem;
    }
    .renew-top strong { font-size: 0.92rem; color: var(--bb-text); }
    .tag-popular {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      background: var(--bb-primary);
      color: #fff;
    }
    .renew-body p { margin: 0; font-size: 0.78rem; color: var(--bb-muted); }
    .modal-trust {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem 1.25rem;
      margin-bottom: 1rem;
      font-size: 0.72rem;
      color: var(--bb-muted);
      font-weight: 600;
    }
    .modal-trust span {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }
    .modal-trust .material-icons-outlined { font-size: 16px !important; color: var(--bb-primary); }
    .modal-cta { width: 100%; }

    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 180;
    }
    .drawer-panel {
      position: fixed;
      top: 0;
      right: 0;
      z-index: 190;
      width: min(440px, 100vw);
      height: 100vh;
      background: var(--bb-surface);
      border-left: 1px solid var(--bb-border);
      box-shadow: -12px 0 40px rgba(15, 23, 42, 0.12);
      display: flex;
      flex-direction: column;
    }
    .drawer-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem 1.25rem 1rem;
      border-bottom: 1px solid var(--bb-border);
      flex-shrink: 0;
    }
    .drawer-head h2 {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .drawer-head p {
      margin: 0;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .drawer-close {
      border: none;
      background: transparent;
      color: var(--bb-muted);
      cursor: pointer;
      padding: 0.25rem;
      line-height: 0;
      flex-shrink: 0;
    }
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }
  `,
})
export class CreateShipmentComponent implements OnInit {
  private readonly api = inject(BorderboxApiService);
  private readonly parcelsSvc = inject(ParcelsService);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly router = inject(Router);

  readonly deliveryMethod = signal<DeliveryMethodChoice>(PICKUP_METHOD);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly selectedAddressId = signal<string>('');
  readonly selectedRenewPlanId = signal('plan_quarterly');
  readonly submitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly showModal = signal(false);
  readonly addressDrawerOpen = signal(false);
  readonly addressSaving = signal(false);
  readonly suitePlans = signal<SuitePlanDto[]>([]);
  readonly landedCostEstimate = signal<number | null>(null);
  readonly declaredGoodsValue = signal<number | null>(null);
  readonly landedCostBreakdown = signal<QuoteBreakdownLineDto[]>([]);
  readonly vatCharged = signal(false);
  readonly dutyCharged = signal(false);
  readonly dutyThresholdZar = signal(10_000);
  readonly estimatingCost = signal(false);

  readonly shipOutLocked = computed(
    () => this.parcelsSvc.dashboard()?.suiteAccess?.shipOutLocked ?? false,
  );

  readonly suiteNumber = computed(() => {
    const dash = this.parcelsSvc.dashboard()?.suiteNumber?.trim();
    const acc = this.accountApi.account()?.suiteAddress?.suiteNumber?.trim();
    return acc || dash || '';
  });

  readonly deliveryAddresses = computed(() => {
    const addrs = this.accountApi.account()?.deliveryAddresses ?? [];
    return [...addrs].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  });

  readonly selectedAddress = computed((): DeliveryAddress | null => {
    const id = this.selectedAddressId();
    return this.deliveryAddresses().find((a) => a.id === id) ?? null;
  });

  readonly renewPlans = computed((): RenewPlanOption[] => {
    const apiPlans = this.suitePlans();
    if (apiPlans.length > 0) {
      return apiPlans.map((p) => ({
        id: p.id,
        priceZar: p.priceZar,
        months: p.durationMonths,
        title: `R${p.priceZar} / ${p.durationMonths} month${p.durationMonths > 1 ? 's' : ''}`,
        subtitle:
          p.durationMonths >= 3
            ? 'Renew for 3 months. Best value & savings.'
            : 'Renew for 1 month. Best for short-term needs.',
        popular: p.isRecommended,
      }));
    }
    return [];
  });

  readonly blockedParcels = computed(() =>
    this.parcelsSvc.parcels().filter((p) => !isQuoteEligibleParcel(p)),
  );

  readonly quoteEligibleParcels = computed(() =>
    this.parcelsSvc.parcels().filter((p) => isQuoteEligibleParcel(p)),
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly totalWeight = computed(() =>
    this.quoteEligibleParcels()
      .filter((p) => this.selectedIds().has(p.id))
      .reduce((sum, p) => sum + (p.weightKg ?? 0), 0),
  );

  readonly selectedGoodsValue = computed(() =>
    this.quoteEligibleParcels()
      .filter((p) => this.selectedIds().has(p.id))
      .reduce((sum, p) => sum + (p.declaredValueZar ?? 0), 0),
  );

  readonly canSubmit = computed(
    () =>
      this.selectedCount() > 0 &&
      !!this.selectedAddress() &&
      !this.submitting(),
  );

  readonly stepParcelsDone = computed(() => this.selectedCount() > 0);
  readonly stepAddressDone = computed(() => !!this.selectedAddress());
  readonly stepPayReady = computed(
    () => this.stepParcelsDone() && this.stepAddressDone() && !this.shipOutLocked(),
  );

  readonly flowSteps = computed((): FlowStep[] => {
    const parcelsDone = this.stepParcelsDone();
    const addressDone = this.stepAddressDone();
    const payReady = this.stepPayReady();
    const status = (done: boolean, active: boolean): FlowStepStatus =>
      done ? 'done' : active ? 'active' : 'pending';

    return [
      { id: 1, label: 'Parcels', status: status(parcelsDone, !parcelsDone) },
      { id: 2, label: 'Address', status: status(addressDone, parcelsDone && !addressDone) },
      {
        id: 3,
        label: 'Pay',
        status: payReady ? 'active' : 'pending',
      },
    ];
  });

  payStepStatusLabel(): string {
    if (this.shipOutLocked()) return 'Blocked';
    if (this.stepPayReady()) return 'In progress';
    if (this.stepAddressDone()) return 'Waiting';
    return 'Blocked';
  }

  blockerLabel(p: ParcelListItem): string {
    const raw = p.quoteRequestBlocker?.trim();
    if (!raw) return 'Not ready';
    if (raw.length <= 28) return raw;
    return raw.slice(0, 25) + '…';
  }

  openAddressDrawer(): void {
    this.addressDrawerOpen.set(true);
  }

  closeAddressDrawer(): void {
    this.addressDrawerOpen.set(false);
  }

  onSaveAddressFromDrawer(body: UpsertDeliveryAddressRequest): void {
    this.addressSaving.set(true);
    this.accountApi.saveDeliveryAddress(null, body).subscribe({
      next: (acc) => {
        this.addressSaving.set(false);
        this.closeAddressDrawer();
        const pick =
          acc.deliveryAddresses.find((a) => a.isDefault) ??
          acc.deliveryAddresses.find(
            (a) =>
              a.branchId === body.branchId &&
              a.fullName === body.fullName &&
              a.phone === body.phone,
          ) ??
          acc.deliveryAddresses[acc.deliveryAddresses.length - 1];
        if (pick) {
          this.selectedAddressId.set(pick.id);
        }
      },
      error: () => this.addressSaving.set(false),
    });
  }

  ngOnInit(): void {
    this.accountApi.ensureAccountLoaded().subscribe({
      next: (acc) => {
        const def = acc.deliveryAddresses.find((a) => a.isDefault) ?? acc.deliveryAddresses[0];
        if (def) this.selectedAddressId.set(def.id);
      },
    });

    this.api.listSuitePlans().subscribe({
      next: (plans) => {
        this.suitePlans.set(plans);
        const popular = plans.find((p) => p.isRecommended) ?? plans[plans.length - 1];
        if (popular) this.selectedRenewPlanId.set(popular.id);
      },
    });

    this.parcelsSvc.loadDashboard().subscribe({
      next: () => {
        if (this.shipOutLocked()) this.showModal.set(true);
      },
    });

    this.parcelsSvc.loadParcels().subscribe({
      next: (items) => {
        const eligible = items.filter((p) => isQuoteEligibleParcel(p));
        if (eligible.length === 1) {
          this.selectedIds.set(new Set([eligible[0].id]));
          this.refreshLandedCostEstimate();
        }
      },
      error: () => this.loadError.set('Could not load parcels.'),
    });
  }

  private refreshLandedCostEstimate(): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) {
      this.landedCostEstimate.set(null);
      this.declaredGoodsValue.set(null);
      this.landedCostBreakdown.set([]);
      this.vatCharged.set(false);
      this.dutyCharged.set(false);
      this.estimatingCost.set(false);
      return;
    }

    this.estimatingCost.set(true);
    this.api.estimateShipmentQuote(ids, this.deliveryMethod()).subscribe({
      next: (estimate) => {
        this.estimatingCost.set(false);
        this.landedCostEstimate.set(estimate.totalLandedCost);
        this.declaredGoodsValue.set(estimate.declaredGoodsValueZar);
        this.vatCharged.set(estimate.vatCharged);
        this.dutyCharged.set(estimate.dutyCharged);
        this.dutyThresholdZar.set(estimate.dutyGoodsValueThresholdZar);
        this.landedCostBreakdown.set(estimate.breakdown ?? []);
      },
      error: () => {
        this.estimatingCost.set(false);
        this.landedCostEstimate.set(null);
        this.declaredGoodsValue.set(null);
        this.landedCostBreakdown.set([]);
        this.vatCharged.set(false);
        this.dutyCharged.set(false);
      },
    });
  }

  parcelRef(id: string): string {
    return formatParcelReference(id);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleParcel(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
    this.refreshLandedCostEstimate();
  }

  selectAllEligible(): void {
    this.selectedIds.set(new Set(this.quoteEligibleParcels().map((p) => p.id)));
    this.refreshLandedCostEstimate();
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.refreshLandedCostEstimate();
  }

  goToRenewCheckout(): void {
    const plan = this.selectedRenewPlanId();
    const query =
      plan.includes('monthly') || plan === 'plan_monthly'
        ? { plan: 'monthly' }
        : { plan: 'quarterly' };
    void this.router.navigate(['/suite-access/checkout'], { queryParams: query });
  }

  submit(): void {
    if (this.shipOutLocked()) {
      this.showModal.set(true);
      return;
    }
    const ids = [...this.selectedIds()];
    if (ids.length === 0 || !this.selectedAddress()) return;

    this.submitting.set(true);
    this.submitError.set(null);
    this.api.createQuoteRequest(ids, this.deliveryMethod()).subscribe({
      next: (result) => {
        this.submitting.set(false);
        void this.router.navigate(['/quotes', result.quoteId]);
      },
      error: (err: { error?: { title?: string; detail?: string }; message?: string }) => {
        this.submitting.set(false);
        const msg =
          err?.error?.detail ??
          err?.error?.title ??
          (typeof err?.message === 'string' ? err.message : 'Could not request quote.');
        this.submitError.set(msg);
        if (this.shipOutLocked()) this.showModal.set(true);
      },
    });
  }
}
