import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BorderboxApiService,
  type InitiateSuiteCheckoutDto,
  type SuiteAccessSummary,
  type SuitePaymentMethodDto,
  type SuitePaymentsOverviewDto,
  type SuitePlanDto,
} from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { PaystackCheckoutService } from '../../services/paystack-checkout.service';
import { MomoPendingComponent } from '../payments/momo-pending.component';
import {
  PaymentMethodPickerComponent,
  type PaymentMethodChoice,
} from '../payments/payment-method-picker.component';

type StatusFilter = 'all' | 'successful' | 'failed' | 'pending';

const PLAN_FEATURES = [
  'All suite features',
  'Unlimited parcel receiving',
  "Ship when you're ready",
] as const;

@Component({
  selector: 'app-suite-checkout',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, MomoPendingComponent, PaymentMethodPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-head">
      <h1>
        <span class="material-icons-outlined head-icon">payments</span>
        Payments
      </h1>
      <p class="head-sub">
        Manage your suite-access subscription, payment history and saved cards.
      </p>
    </header>

    @if (error()) {
      <div class="err-banner" role="alert">{{ error() }}</div>
    }

    <section class="stat-row">
      <div class="stat-card">
        <span class="stat-label">
          <span class="material-icons-outlined">workspace_premium</span>
          Current Plan
        </span>
        <strong class="stat-value">{{ currentPlanLabel() }}</strong>
        <span class="stat-sub">{{ currentPlanPriceLabel() }}</span>
        <button type="button" class="stat-link" (click)="scrollToRenew()">
          View plan details
        </button>
      </div>

      <div class="stat-card">
        <span class="stat-label">
          <span class="material-icons-outlined">event</span>
          Next Payment Amount
        </span>
        <strong class="stat-value money">{{ nextPaymentAmountLabel() }}</strong>
        <span class="stat-sub">{{ nextPaymentDueLabel() }}</span>
        @if (nextPaymentBadgeLabel(); as badge) {
          <span class="badge" [class]="nextPaymentBadgeTone()">{{ badge }}</span>
        }
      </div>

      <div class="stat-card">
        <span class="stat-label">
          <span class="material-icons-outlined">paid</span>
          Last Payment
        </span>
        <strong class="stat-value money">{{ lastPaymentAmountLabel() }}</strong>
        <span class="stat-sub">{{ lastPaymentLabel() }}</span>
        @if (lastPaymentBadgeLabel(); as badge) {
          <span class="badge" [class]="lastPaymentBadgeTone()">{{ badge }}</span>
        }
      </div>

      <div class="stat-card">
        <span class="stat-label">
          <span class="material-icons-outlined">credit_card</span>
          Payment Method
        </span>
        <strong class="stat-value">{{ paymentMethodLabel() }}</strong>
        <span class="stat-sub">{{ paymentMethodSubLabel() }}</span>
        <div class="stat-actions">
          <span class="badge tone-muted">Default</span>
          <button type="button" class="stat-link" (click)="scrollToCards()">
            Manage payment methods
          </button>
        </div>
      </div>
    </section>

    <div class="payments-grid">
      <section class="bb-card history-card">
        <header class="card-head">
          <h2>
            <span class="material-icons-outlined">history</span>
            Payment History
          </h2>
          <label class="filter">
            <select [value]="statusFilter()" (change)="setStatusFilter($any($event.target).value)">
              <option value="all">All Statuses</option>
              <option value="successful">Successful</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </header>

        @if (loading()) {
          <p class="loading">Loading payment history…</p>
        } @else if (visibleHistory().length === 0) {
          <div class="empty">
            <span class="material-icons-outlined">receipt_long</span>
            <p>No payments yet. Once you renew your suite access, your invoices will appear here.</p>
          </div>
        } @else {
          <div class="history-scroll">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Plan</th>
                  <th class="num">Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Invoice</th>
                  <th class="num">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (row of visibleHistory(); track row.reference) {
                  <tr>
                    <td class="date-cell">
                      <strong>{{ row.createdAtUtc | date:'d MMM y' }}</strong>
                      <span class="muted">{{ row.createdAtUtc | date:'HH:mm' }}</span>
                    </td>
                    <td>{{ row.planName }}</td>
                    <td>{{ planShortLabel(row.planDurationMonths) }}</td>
                    <td class="num">R{{ row.amountZar | number:'1.0-0' }}</td>
                    <td>
                      <span class="method-pill" aria-hidden="true">
                        <span class="material-icons-outlined">credit_card</span>
                        •••• 4242
                      </span>
                    </td>
                    <td>
                      <span class="badge" [class]="statusBadgeTone(row.status)">{{ row.status }}</span>
                    </td>
                    <td>
                      @if (row.status === 'Successful') {
                        <a
                          class="invoice-link"
                          [href]="invoiceViewUrl(row.reference)"
                          target="_blank"
                          rel="noopener"
                          title="Open receipt in a new tab"
                        >{{ row.invoiceNumber }}</a>
                      } @else {
                        <span class="invoice-link is-muted" [title]="row.status === 'Failed' ? 'Available once payment succeeds' : 'Available once payment completes'">{{ row.invoiceNumber }}</span>
                      }
                    </td>
                    <td class="num">
                      @if (row.status === 'Failed') {
                        <button type="button" class="icon-btn" title="Retry payment" (click)="scrollToRenew()">
                          <span class="material-icons-outlined">refresh</span>
                        </button>
                      } @else if (row.status === 'Successful') {
                        <a
                          class="icon-btn"
                          [href]="invoiceDownloadUrl(row.reference)"
                          [attr.download]="row.invoiceNumber + '.html'"
                          title="Download receipt"
                        >
                          <span class="material-icons-outlined">download</span>
                        </a>
                      } @else {
                        <button type="button" class="icon-btn" disabled title="Available once payment completes">
                          <span class="material-icons-outlined">hourglass_empty</span>
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <aside class="side-col">
        <section class="bb-card cards-card" #cardsSection>
          <header class="card-head">
            <h2>
              <span class="material-icons-outlined">credit_card</span>
              Saved Payment Methods
            </h2>
            <button
              type="button"
              class="bb-btn bb-btn-outline"
              (click)="openAddCard()"
              [disabled]="addCardBusy()"
            >
              <span class="material-icons-outlined">add</span>
              {{ addCardBusy() ? 'Opening Paystack…' : 'Add Card' }}
            </button>
          </header>

          @if (savedCards().length === 0) {
            <div class="empty no-card">
              <p>
                Save a personal or business card for faster renewals. We use a small Paystack
                verification (refunded automatically) — you can add more than one card.
              </p>
            </div>
          } @else {
            <ul class="saved-cards-list">
              @for (card of savedCards(); track card.id) {
                <li class="card-row" [class.is-default]="card.isDefault">
                  <div class="card-icon">
                    <span class="material-icons-outlined">credit_card</span>
                  </div>
                  <div class="card-meta">
                    <strong>{{ cardDisplayTitle(card) }}</strong>
                    <span class="muted">Expires {{ formatCardExpiry(card) }}</span>
                  </div>
                  <div class="card-actions">
                    @if (card.isDefault) {
                      <span class="badge tone-muted">Default</span>
                    } @else {
                      <button type="button" class="card-action" (click)="setDefaultCard(card)">
                        Make default
                      </button>
                    }
                    <button type="button" class="card-action" (click)="editCardLabel(card)">
                      Label
                    </button>
                    <button type="button" class="card-action danger" (click)="removeCard(card)">
                      Remove
                    </button>
                  </div>
                </li>
              }
            </ul>
            <button
              type="button"
              class="add-card-link"
              (click)="openAddCard()"
              [disabled]="addCardBusy()"
            >
              + Add another card
            </button>
          }

          <p class="security-note">
            <span class="material-icons-outlined">lock</span>
            Your payment details are secure and encrypted
          </p>
        </section>

        <section class="bb-card summary-card">
          <header class="card-head">
            <h2>
              <span class="material-icons-outlined">receipt_long</span>
              Invoices Summary
            </h2>
          </header>

          <dl class="summary-kv">
            <div><dt>Total Invoices</dt><dd>{{ overview()?.summary?.totalInvoices ?? 0 }}</dd></div>
            <div><dt>Paid Invoices</dt><dd class="ok">{{ overview()?.summary?.paid ?? 0 }}</dd></div>
            <div><dt>Failed Invoices</dt><dd class="err">{{ overview()?.summary?.failed ?? 0 }}</dd></div>
            <div class="total-row">
              <dt>Total Amount Paid</dt>
              <dd class="strong">R{{ (overview()?.summary?.totalPaidZar ?? 0) | number:'1.0-0' }}</dd>
            </div>
          </dl>

          <button type="button" class="bb-btn bb-btn-outline view-all" (click)="setStatusFilter('all')">
            View all invoices
          </button>
        </section>
      </aside>
    </div>

    <section class="bb-card renew-card" #renewSection>
      <header class="card-head">
        <h2>
          <span class="material-icons-outlined">autorenew</span>
          Renew Suite Access
        </h2>
      </header>

      @if (suiteStillActive()) {
        <div class="info-banner" role="status">
          <span class="material-icons-outlined">verified_user</span>
          <p>
            Your suite access is active until <strong>{{ activeUntilLabel() }}</strong>.
            Renewal opens after your current period ends — your subscription will not lapse.
          </p>
        </div>
      } @else {
        <div class="warn-banner" role="alert">
          <span class="material-icons-outlined">priority_high</span>
          <p>
            Suite access needs to be renewed for parcels to be couriered. Choose a plan and pay below.
          </p>
        </div>
      }

      <div class="checkout-layout" [class.checkout-disabled]="suiteStillActive()">
        <div class="main-col">
          <section class="panel">
            <h3 class="panel-title">1. Choose a Plan</h3>
            <div class="plan-row">
              @for (p of orderedPlans(); track p.id) {
                <label class="plan-option" [class.selected]="selectedPlan()?.id === p.id">
                  <input
                    type="radio"
                    name="plan"
                    class="plan-radio"
                    [checked]="selectedPlan()?.id === p.id"
                    (change)="selectPlan(p)"
                  />
                  @if (selectedPlan()?.id === p.id) {
                    <span class="plan-check material-icons-outlined" aria-hidden="true">check_circle</span>
                  }
                  <div class="plan-body">
                    <div class="plan-top">
                      <span class="plan-name">{{ planLabel(p) }}</span>
                      @if (p.isRecommended) {
                        <span class="tag-recommended">Recommended</span>
                      }
                    </div>
                    <p class="plan-price">
                      R{{ p.priceZar | number:'1.0-0' }}
                      <span class="plan-period">/ {{ p.durationMonths }} month{{ p.durationMonths > 1 ? 's' : '' }}</span>
                    </p>
                    <p class="plan-paid">Paid upfront</p>
                    <p class="plan-billing">{{ planBillingLabel(p) }}</p>
                  </div>
                </label>
              }
            </div>

            <ul class="feature-list">
              @for (f of planFeatures; track f) {
                <li>
                  <span class="material-icons-outlined feat-check">check_circle</span>
                  {{ f }}
                </li>
              }
            </ul>
          </section>

          <section class="panel">
            <h3 class="panel-title">2. Choose Payment Method</h3>
            <p class="panel-sub">All payments are secure and encrypted.</p>
            <app-payment-method-picker
              [defaultMsisdn]="defaultPayerMsisdn()"
              (choiceChange)="paymentChoice.set($event)"
            />
          </section>

          @if (momoPending(); as momo) {
            <app-momo-pending
              [reference]="momo.reference"
              [payerMsisdn]="momo.payerMsisdn"
              [amountLabel]="momo.amountLabel"
              (succeeded)="onMomoSucceeded($event)"
              (failed)="onMomoFailed($event)"
              (cancelled)="onMomoCancelled()"
            />
          } @else {
            <button
              type="button"
              class="pay-cta"
              (click)="pay()"
              [disabled]="busy() || !selectedPlan() || !paymentChoice() || suiteStillActive()"
            >
              <span class="material-icons-outlined">lock</span>
              {{ busy() ? 'Starting checkout…' : 'Pay R' + amount() + ' Securely' }}
            </button>
          }

          <p class="legal">
            By proceeding, you agree to our
            <a href="#" class="legal-link">Terms of Service</a>
            and
            <a href="#" class="legal-link">Privacy Policy</a>.
          </p>
        </div>

        <aside class="summary panel">
          <div class="summary-head">
            <span class="material-icons-outlined summary-icon">receipt_long</span>
            <div>
              <h3 class="summary-title">Order Summary</h3>
              <p class="summary-sub">Review your suite access details.</p>
            </div>
          </div>

          <dl class="summary-kv">
            <div><dt>Suite Number</dt><dd>{{ suiteNumber() }}</dd></div>
            <div><dt>Plan</dt><dd>{{ selectedPlan() ? planLabel(selectedPlan()!) : '—' }}</dd></div>
            <div><dt>Billing Period</dt><dd>{{ billingPeriod() }}</dd></div>
          </dl>

          <div class="amount-block">
            <span class="amount-label">Amount Due</span>
            <p class="amount-value">R{{ amount() | number:'1.2-2' }}</p>
            <span class="amount-note">Paid upfront</span>
          </div>
        </aside>
      </div>
    </section>

    @if (addCardOpen()) {
      <div class="add-card-backdrop" role="presentation" (click)="cancelAddCard()"></div>
      <div class="add-card-dialog bb-card" role="dialog" aria-labelledby="add-card-title">
        <h3 id="add-card-title">Add a card</h3>
        <p class="dialog-lead">
          Optional label helps tell cards apart (e.g. Personal, Business). Paystack will verify
          your card with a small charge that we refund automatically.
        </p>
        <label class="dialog-field">
          <span>Label (optional)</span>
          <input
            type="text"
            maxlength="40"
            [(ngModel)]="pendingCardLabel"
            placeholder="Personal, Business, …"
          />
        </label>
        <div class="dialog-actions">
          <button type="button" class="bb-btn bb-btn-ghost" (click)="cancelAddCard()">Cancel</button>
          <button type="button" class="bb-btn bb-btn-primary" (click)="confirmAddCard()">
            Continue to Paystack
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .page-head { margin-bottom: 1.25rem; }
    .page-head h1 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.625rem;
      font-weight: 700;
      color: var(--bb-text);
      letter-spacing: -0.02em;
    }
    .head-icon {
      font-size: 1.5rem;
      color: var(--bb-link);
    }
    .head-sub {
      margin: 0.35rem 0 0;
      font-size: 0.9rem;
      color: var(--bb-muted);
    }

    .err-banner {
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      border-radius: var(--bb-radius-sm);
      background: var(--bb-danger-soft);
      border: 1px solid var(--bb-danger-border);
      color: #b91c1c;
      font-size: 0.85rem;
    }

    .stat-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 1100px) {
      .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 600px) {
      .stat-row { grid-template-columns: 1fr; }
    }
    .stat-card {
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      padding: 0.95rem 1.1rem 1.05rem;
      box-shadow: var(--bb-shadow);
    }
    .stat-label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--bb-muted);
    }
    .stat-label .material-icons-outlined {
      font-size: 1.05rem !important;
      color: var(--bb-link);
    }
    .stat-value {
      display: block;
      margin: 0.45rem 0 0.15rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--bb-text);
      line-height: 1.2;
    }
    .stat-value.money { font-size: 1.45rem; }
    .stat-sub {
      display: block;
      font-size: 0.78rem;
      color: var(--bb-muted);
    }
    .stat-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.45rem;
    }
    .stat-link {
      background: none;
      border: none;
      padding: 0;
      color: var(--bb-link);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      margin-top: 0.4rem;
      text-decoration: underline;
      text-decoration-color: var(--bb-lime);
      text-underline-offset: 2px;
    }
    .stat-link:hover { text-decoration: underline; }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: none;
      letter-spacing: 0;
    }
    .badge.tone-green {
      background: #dcfce7;
      color: #15803d;
    }
    .badge.tone-amber {
      background: #fef3c7;
      color: #b45309;
    }
    .badge.tone-red {
      background: #fee2e2;
      color: #b91c1c;
    }
    .badge.tone-muted {
      background: #f1f5f9;
      color: var(--bb-muted);
    }

    .payments-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 1.25rem;
      align-items: start;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 1024px) {
      .payments-grid { grid-template-columns: 1fr; }
    }

    .bb-card {
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow);
      padding: 1.25rem 1.35rem;
    }

    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .card-head h2 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 1rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .card-head h2 .material-icons-outlined {
      font-size: 1.1rem !important;
      color: var(--bb-link);
    }

    .filter select {
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: 6px;
      background: var(--bb-surface);
      font-size: 0.8rem;
      color: var(--bb-text);
    }

    .history-scroll { overflow-x: auto; }
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .history-table th {
      text-align: left;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--bb-muted);
      padding: 0.65rem 0.5rem;
      border-bottom: 1px solid var(--bb-border);
    }
    .history-table th.num,
    .history-table td.num { text-align: right; }
    .history-table td {
      padding: 0.85rem 0.5rem;
      vertical-align: top;
      border-bottom: 1px solid var(--bb-border);
      color: var(--bb-text);
    }
    .history-table tbody tr:last-child td { border-bottom: none; }
    .date-cell strong { display: block; }
    .date-cell .muted { color: var(--bb-muted); font-size: 0.74rem; }
    .muted { color: var(--bb-muted); }

    .method-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--bb-border);
      border-radius: 6px;
      background: #f8fafc;
      font-size: 0.78rem;
      color: var(--bb-text);
    }
    .method-pill .material-icons-outlined { font-size: 0.95rem !important; }

    .invoice-link.is-muted {
      color: var(--bb-muted, #94a3b8);
      cursor: not-allowed;
    }
    .invoice-link {
      color: var(--bb-link);
      font-weight: 600;
      text-decoration: underline;
      text-decoration-color: #b8860b;
      text-underline-offset: 2px;
    }
    .invoice-link:hover { text-decoration: underline; }

    .icon-btn {
      width: 2rem;
      height: 2rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--bb-surface);
      border: 1px solid var(--bb-border);
      border-radius: 8px;
      color: var(--bb-muted);
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .icon-btn:hover {
      border-color: var(--bb-link);
      color: var(--bb-link);
    }
    .icon-btn .material-icons-outlined { font-size: 1rem !important; }

    .side-col { display: grid; gap: 1.25rem; }

    .saved-cards-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .card-row {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.85rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #f8fafc;
    }
    .card-row.is-default {
      border-color: var(--bb-lime);
      background: var(--bb-lime-soft);
    }
    .card-icon {
      width: 2.25rem;
      height: 2.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bb-surface);
      border-radius: 6px;
      border: 1px solid var(--bb-border);
    }
    .card-icon .material-icons-outlined {
      color: var(--bb-link);
    }
    .card-meta strong {
      display: block;
      font-size: 0.88rem;
      color: var(--bb-text);
    }
    .card-meta .muted { font-size: 0.75rem; }

    .add-card-link {
      display: block;
      margin: 0.85rem 0 0.65rem;
      background: none;
      border: none;
      padding: 0;
      color: var(--bb-link);
      font-weight: 600;
      cursor: pointer;
      font-size: 0.82rem;
    }
    .add-card-link:hover { text-decoration: underline; }

    .card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
      margin-left: auto;
    }
    .card-action {
      border: none;
      background: transparent;
      padding: 0.2rem 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--bb-link);
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: var(--bb-lime);
    }
    .card-action.danger {
      color: #b91c1c;
      text-decoration-color: #fecaca;
    }

    .add-card-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(41, 41, 40, 0.45);
      z-index: 200;
    }
    .add-card-dialog {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 201;
      width: min(420px, calc(100vw - 2rem));
      padding: 1.25rem 1.35rem;
    }
    .add-card-dialog h3 {
      margin: 0 0 0.35rem;
      font-size: 1.1rem;
    }
    .dialog-lead {
      margin: 0 0 1rem;
      font-size: 0.85rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .dialog-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-bottom: 1rem;
      font-size: 0.82rem;
      font-weight: 600;
    }
    .dialog-field input {
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      font: inherit;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .security-note {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      font-size: 0.74rem;
      color: var(--bb-muted);
    }
    .security-note .material-icons-outlined {
      font-size: 0.9rem !important;
    }

    .summary-kv {
      margin: 0;
      padding: 0;
    }
    .summary-kv > div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 0.55rem 0;
      font-size: 0.85rem;
      border-bottom: 1px solid var(--bb-border);
    }
    .summary-kv > div:last-child { border-bottom: none; }
    .summary-kv dt {
      margin: 0;
      color: var(--bb-muted);
      font-weight: 500;
    }
    .summary-kv dd {
      margin: 0;
      font-weight: 700;
      color: var(--bb-text);
    }
    .summary-kv dd.ok { color: #15803d; }
    .summary-kv dd.err { color: #b91c1c; }
    .summary-kv dd.strong { font-size: 1.1rem; }
    .summary-kv .total-row {
      padding-top: 0.85rem;
      border-top: 2px solid var(--bb-border);
    }

    .view-all {
      width: 100%;
      margin-top: 0.85rem;
      justify-content: center;
    }

    .empty {
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--bb-muted);
      font-size: 0.85rem;
    }
    .empty .material-icons-outlined {
      font-size: 2rem !important;
      color: #cbd5e1;
      display: block;
      margin: 0 auto 0.5rem;
    }
    .empty.no-card {
      background: #f8fafc;
      border-radius: var(--bb-radius-sm);
      padding: 1rem;
      margin-bottom: 0.75rem;
    }
    .empty.no-card p { margin: 0; line-height: 1.45; }
    .loading {
      padding: 1.5rem 0;
      text-align: center;
      color: var(--bb-muted);
      font-size: 0.85rem;
    }

    /* ---- Renew card (existing checkout form, restyled to fit dashboard) ---- */
    .renew-card { margin-bottom: 1rem; }

    .info-banner,
    .warn-banner {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      padding: 0.85rem 1rem;
      border-radius: var(--bb-radius-sm);
      margin-bottom: 1rem;
      font-size: 0.85rem;
      line-height: 1.45;
    }
    .info-banner {
      background: var(--bb-primary-soft);
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }
    .warn-banner {
      background: #fef3c7;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .info-banner p,
    .warn-banner p { margin: 0; }

    .checkout-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 1024px) {
      .checkout-layout { grid-template-columns: 1fr; }
    }
    .checkout-disabled {
      opacity: 0.55;
      pointer-events: none;
    }

    .panel {
      background: #f8fafc;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      padding: 1.1rem 1.2rem;
      margin-bottom: 1rem;
    }
    .panel-title {
      margin: 0 0 0.75rem;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .panel-sub {
      margin: -0.4rem 0 0.85rem;
      font-size: 0.78rem;
      color: var(--bb-muted);
    }

    .plan-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 640px) {
      .plan-row { grid-template-columns: 1fr; }
    }
    .plan-option {
      position: relative;
      display: block;
      padding: 0.9rem 0.9rem 0.9rem 2.5rem;
      border: 2px solid var(--bb-border);
      border-radius: var(--bb-radius);
      background: var(--bb-surface);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    }
    .plan-option:hover { border-color: #93c5fd; }
    .plan-option.selected {
      border-color: var(--bb-link);
      background: linear-gradient(180deg, #f8fbff 0%, #fff 100%);
      box-shadow: 0 0 0 1px var(--bb-primary);
    }
    .plan-radio {
      position: absolute;
      left: 0.85rem;
      top: 1rem;
      accent-color: var(--bb-link);
      width: 1.05rem;
      height: 1.05rem;
    }
    .plan-check {
      position: absolute;
      top: 0.55rem;
      right: 0.55rem;
      font-size: 1.25rem !important;
      color: var(--bb-link);
    }
    .plan-top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }
    .plan-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .tag-recommended {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: #dcfce7;
      color: #15803d;
    }
    .plan-price {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--bb-text);
      line-height: 1.2;
    }
    .plan-period {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--bb-muted);
    }
    .plan-paid {
      margin: 0.2rem 0 0;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--bb-muted);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .plan-billing {
      margin: 0.15rem 0 0;
      font-size: 0.76rem;
      color: var(--bb-muted);
    }

    .feature-list {
      margin: 0.75rem 0 0;
      padding: 0;
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.4rem 1rem;
    }
    .feature-list li {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--bb-text);
    }
    .feat-check {
      font-size: 1rem !important;
      color: var(--bb-success);
    }

    .pay-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 640px) {
      .pay-row { grid-template-columns: 1fr; }
    }
    .pay-option {
      position: relative;
      display: block;
      padding: 0.9rem 0.9rem 0.9rem 2.5rem;
      border: 2px solid var(--bb-border);
      border-radius: var(--bb-radius);
      background: var(--bb-surface);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .pay-option.selected {
      border-color: var(--bb-link);
      background: var(--bb-primary-soft);
    }
    .pay-radio {
      position: absolute;
      left: 0.85rem;
      top: 1rem;
      accent-color: var(--bb-link);
      width: 1.05rem;
      height: 1.05rem;
    }
    .pay-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }
    .pay-name {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .pay-desc {
      margin: 0;
      font-size: 0.78rem;
      color: var(--bb-muted);
    }
    .pay-bank {
      font-size: 1.4rem !important;
      color: var(--bb-muted);
    }
    .card-brands {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.62rem;
      font-weight: 800;
    }
    .brand.visa {
      color: #1a1f71;
      background: #fff;
      border: 1px solid #e2e8f0;
      padding: 0.1rem 0.25rem;
      border-radius: 3px;
    }
    .brand.mc {
      color: #eb001b;
      background: #fff;
      border: 1px solid #e2e8f0;
      padding: 0.1rem 0.2rem;
      border-radius: 3px;
    }

    .pay-cta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.85rem 1.25rem;
      border: none;
      border-radius: var(--bb-radius-sm);
      background: var(--bb-primary);
      color: #fff;
      font-size: 1rem;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(0, 82, 204, 0.35);
      cursor: pointer;
    }
    .pay-cta:hover:not(:disabled) { background: var(--bb-primary-hover); }
    .pay-cta:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
    }

    .legal {
      margin: 0.85rem 0 0;
      text-align: center;
      font-size: 0.76rem;
      color: var(--bb-muted);
    }
    .legal-link {
      color: var(--bb-link);
      text-decoration: none;
      font-weight: 600;
    }
    .legal-link:hover { text-decoration: underline; }

    .summary {
      position: sticky;
      top: 1rem;
      padding: 1.2rem;
      background: var(--bb-surface);
    }
    .summary-head {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      margin-bottom: 1rem;
      padding-bottom: 0.85rem;
      border-bottom: 1px solid var(--bb-border);
    }
    .summary-icon {
      font-size: 1.6rem !important;
      color: var(--bb-link);
    }
    .summary-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }
    .summary-sub {
      margin: 0.2rem 0 0;
      font-size: 0.76rem;
      color: var(--bb-muted);
    }
    .amount-block {
      margin: 0.75rem 0 0;
      padding: 1rem 0 0;
      border-top: 1px solid var(--bb-border);
      text-align: center;
    }
    .amount-label {
      display: block;
      font-size: 0.78rem;
      color: var(--bb-muted);
      font-weight: 600;
    }
    .amount-value {
      margin: 0.25rem 0 0;
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--bb-link);
      letter-spacing: -0.02em;
    }
    .amount-note {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.72rem;
      color: var(--bb-muted);
    }
  `,
})
export class SuiteCheckoutComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly borderboxApi = inject(BorderboxApiService);
  private readonly parcelsApi = inject(ParcelsService);
  private readonly paystack = inject(PaystackCheckoutService);

  readonly planFeatures = PLAN_FEATURES;
  readonly plans = signal<SuitePlanDto[]>([]);
  readonly selectedPlan = signal<SuitePlanDto | null>(null);
  readonly paymentChoice = signal<PaymentMethodChoice | null>(null);
  readonly picker = viewChild(PaymentMethodPickerComponent);
  readonly renewSection = viewChild<ElementRef<HTMLElement>>('renewSection');
  readonly cardsSection = viewChild<ElementRef<HTMLElement>>('cardsSection');
  readonly addCardOpen = signal(false);
  readonly addCardBusy = signal(false);
  pendingCardLabel = '';

  readonly savedCards = computed((): SuitePaymentMethodDto[] => {
    const o = this.overview();
    if (!o) return [];
    if (o.paymentMethods?.length) return o.paymentMethods;
    return o.paymentMethod ? [o.paymentMethod] : [];
  });
  /**
   * Picks the phone we should pre-fill on the MoMo picker, in priority order:
   *   1. Default delivery address phone (set via /my-address).
   *   2. Any delivery address phone.
   *   3. Account profile phone.
   */
  readonly defaultPayerMsisdn = computed((): string | null => {
    const acc = this.accountApi.account();
    if (!acc) return null;
    const defaultAddr = acc.deliveryAddresses.find((a) => a.isDefault && a.phone?.trim());
    if (defaultAddr?.phone) return defaultAddr.phone;
    const anyAddr = acc.deliveryAddresses.find((a) => a.phone?.trim());
    if (anyAddr?.phone) return anyAddr.phone;
    return acc.profile.phone?.trim() || null;
  });
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly suiteAccess = signal<SuiteAccessSummary | null>(null);
  readonly overview = signal<SuitePaymentsOverviewDto | null>(null);
  readonly statusFilter = signal<StatusFilter>('all');

  readonly orderedPlans = computed(() => {
    const list = [...this.plans()];
    return list.sort((a, b) => b.durationMonths - a.durationMonths);
  });

  readonly suiteNumber = computed(
    () =>
      this.overview()?.subscription?.suiteNumber ??
      this.suiteAccess()?.suiteNumber ??
      this.accountApi.account()?.suiteAddress?.suiteNumber ??
      'Pending assignment',
  );

  readonly suiteStillActive = computed(() => {
    const access = this.suiteAccess();
    if (!access?.expiresAt) return false;
    if (access.shipOutLocked) return false;
    return Date.parse(access.expiresAt) > Date.now();
  });

  readonly activeUntilLabel = computed(() => {
    const raw = this.suiteAccess()?.expiresAt;
    if (!raw) return '';
    return this.formatDate(new Date(raw));
  });

  readonly visibleHistory = computed(() => {
    const rows = this.overview()?.history ?? [];
    const filter = this.statusFilter();
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status.toLowerCase() === filter);
  });

  setStatusFilter(value: string): void {
    this.statusFilter.set((['all', 'successful', 'failed', 'pending'].includes(value)
      ? value
      : 'all') as StatusFilter);
  }

  currentPlanLabel = (): string =>
    this.overview()?.currentPlan?.planLabel ?? 'No active plan';

  currentPlanPriceLabel = (): string => {
    const plan = this.overview()?.currentPlan;
    if (!plan) return '—';
    return `R${Math.round(plan.priceZar)} / ${plan.durationMonths} month${plan.durationMonths > 1 ? 's' : ''}`;
  };

  nextPaymentAmountLabel = (): string => {
    const next = this.overview()?.nextPayment;
    return next ? `R${Math.round(next.amountZar)}` : '—';
  };

  nextPaymentDueLabel = (): string => {
    const next = this.overview()?.nextPayment;
    if (!next) return 'No upcoming payment';
    return `Due on ${this.formatDate(new Date(next.dueAtUtc))}`;
  };

  nextPaymentBadgeLabel = (): string | null => {
    const next = this.overview()?.nextPayment;
    if (!next) return null;
    if (next.daysRemaining <= 0) return 'Due now';
    if (next.daysRemaining <= 7) return `${next.daysRemaining} days remaining`;
    return `${next.daysRemaining} days remaining`;
  };

  nextPaymentBadgeTone = (): string => {
    const next = this.overview()?.nextPayment;
    if (!next) return 'tone-muted';
    if (next.daysRemaining <= 0) return 'tone-red';
    if (next.daysRemaining <= 7) return 'tone-amber';
    return 'tone-green';
  };

  lastPaymentAmountLabel = (): string => {
    const last = this.overview()?.lastPayment;
    return last ? `R${Math.round(last.amountZar)}` : '—';
  };

  lastPaymentLabel = (): string => {
    const last = this.overview()?.lastPayment;
    if (!last) return 'No payments yet';
    return `Paid on ${this.formatDate(new Date(last.paidAtUtc))}`;
  };

  lastPaymentBadgeLabel = (): string | null =>
    this.overview()?.lastPayment ? 'Successful' : null;

  lastPaymentBadgeTone = (): string => 'tone-green';

  paymentMethodLabel = (): string => {
    const card = this.savedCards().find((c) => c.isDefault) ?? this.savedCards()[0];
    return card ? this.cardDisplayTitle(card) : 'Not added yet';
  };

  paymentMethodSubLabel = (): string => {
    const card = this.savedCards().find((c) => c.isDefault) ?? this.savedCards()[0];
    return card ? `Expires ${this.formatCardExpiry(card)}` : 'Add a personal or business card';
  };

  cardDisplayTitle(card: SuitePaymentMethodDto): string {
    if (card.label?.trim()) {
      return `${card.label.trim()} · ${this.formatCardBrand(card)} •••• ${card.last4}`;
    }
    return card.descriptor || `${this.formatCardBrand(card)} •••• ${card.last4}`;
  }

  formatCardBrand(card: SuitePaymentMethodDto): string {
    const t = card.cardType?.trim();
    if (!t) return 'Card';
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }

  formatCardExpiry(card: SuitePaymentMethodDto): string {
    const y = card.expYear?.length >= 2 ? card.expYear.slice(-2) : card.expYear;
    return `${card.expMonth}/${y}`;
  }

  amount = (): number => this.selectedPlan()?.priceZar ?? 0;

  billingPeriod = (): string => {
    const m = this.selectedPlan()?.durationMonths;
    if (!m) return '—';
    return m === 1 ? '1 Month' : `${m} Months`;
  };

  planLabel(p: SuitePlanDto): string {
    if (p.durationMonths === 3) return 'Quarterly';
    if (p.durationMonths === 1) return 'Monthly';
    return p.name.replace(/\s+suite\s+access$/i, '').trim() || p.name;
  }

  planShortLabel(durationMonths: number): string {
    if (durationMonths === 1) return 'Monthly Plan';
    if (durationMonths === 3) return 'Quarterly Suite Access';
    if (durationMonths === 12) return 'Annual Suite Access';
    return 'Suite Access';
  }

  planBillingLabel(p: SuitePlanDto): string {
    return p.durationMonths === 1
      ? 'Billed upfront every month'
      : `Billed upfront every ${p.durationMonths} months`;
  }

  statusBadgeTone(status: string): string {
    switch (status.toLowerCase()) {
      case 'successful':
        return 'tone-green';
      case 'failed':
        return 'tone-red';
      default:
        return 'tone-amber';
    }
  }

  scrollToRenew(): void {
    this.renewSection()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToCards(): void {
    this.cardsSection()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openAddCard(): void {
    this.pendingCardLabel = '';
    this.addCardOpen.set(true);
  }

  cancelAddCard(): void {
    this.addCardOpen.set(false);
  }

  confirmAddCard(): void {
    this.addCardOpen.set(false);
    const label = this.pendingCardLabel.trim();
    if (label) {
      sessionStorage.setItem('weyell_pending_card_label', label);
    } else {
      sessionStorage.removeItem('weyell_pending_card_label');
    }

    const callbackUrl = `${window.location.origin}/suite-access/payment-methods/added`;
    this.addCardBusy.set(true);
    this.error.set(null);

    this.borderboxApi.initiateAddPaymentMethod(callbackUrl, label || null).subscribe({
      next: (res) => {
        this.onAddCardInitiated(res);
      },
      error: (err: Error) => {
        this.addCardBusy.set(false);
        this.error.set(err?.message ?? 'Could not start card verification.');
      },
    });
  }

  private onAddCardInitiated(res: InitiateSuiteCheckoutDto): void {
    this.paystack
      .start(res)
      .then((outcome) => {
        this.addCardBusy.set(false);
        if (outcome.status === 'success') {
          void this.router.navigateByUrl(
            `/suite-access/payment-methods/added?reference=${encodeURIComponent(outcome.reference)}`,
          );
          return;
        }
        if (outcome.status === 'error') {
          this.error.set(outcome.message);
        }
      })
      .catch(() => {
        this.addCardBusy.set(false);
        window.location.href = res.authorizationUrl;
      });
  }

  setDefaultCard(card: SuitePaymentMethodDto): void {
    this.borderboxApi.setDefaultPaymentMethod(card.id).subscribe({
      next: () => this.reloadOverview(),
      error: (err: Error) => this.error.set(err?.message ?? 'Could not update default card.'),
    });
  }

  removeCard(card: SuitePaymentMethodDto): void {
    if (!confirm(`Remove ${this.cardDisplayTitle(card)} from your saved cards?`)) {
      return;
    }
    this.borderboxApi.removePaymentMethod(card.id).subscribe({
      next: () => this.reloadOverview(),
      error: (err: Error) => this.error.set(err?.message ?? 'Could not remove card.'),
    });
  }

  editCardLabel(card: SuitePaymentMethodDto): void {
    const next = prompt('Card label (e.g. Personal, Business)', card.label ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    this.borderboxApi.updatePaymentMethodLabel(card.id, trimmed || null).subscribe({
      next: () => this.reloadOverview(),
      error: (err: Error) => this.error.set(err?.message ?? 'Could not update label.'),
    });
  }

  private reloadOverview(): void {
    this.borderboxApi.getSuitePaymentsOverview().subscribe({
      next: (o) => this.overview.set(o),
    });
  }

  /**
   * Open the suite-access receipt inline in a new tab. The receipt is
   * generated on demand from the payment record + plan + subscription so
   * customers always see an up-to-date document.
   */
  invoiceViewUrl(reference: string): string {
    return this.borderboxApi.suitePaymentInvoiceDownloadUrl(reference);
  }

  /** Same endpoint, but with ?download so the browser saves the HTML file. */
  invoiceDownloadUrl(reference: string): string {
    return this.borderboxApi.suitePaymentInvoiceDownloadUrl(reference, true);
  }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('plan');
    this.accountApi.ensureAccountLoaded().subscribe();
    this.parcelsApi.loadDashboard().subscribe({
      next: (d) => this.suiteAccess.set(d.suiteAccess),
    });

    this.borderboxApi.listSuitePlans().subscribe({
      next: (list) => {
        this.plans.set(list);
        const quarterly = list.find((p) => p.durationMonths === 3);
        const monthly = list.find((p) => p.durationMonths === 1);
        if (q === 'monthly' && monthly) {
          this.selectedPlan.set(monthly);
        } else if (quarterly) {
          this.selectedPlan.set(quarterly);
        } else if (list.length > 0) {
          this.selectedPlan.set(list[0]);
        }
      },
      error: () => this.error.set('Could not load suite plans.'),
    });

    this.borderboxApi.getSuitePaymentsOverview().subscribe({
      next: (o) => {
        this.overview.set(o);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  selectPlan(p: SuitePlanDto): void {
    this.selectedPlan.set(p);
    this.error.set(null);
  }

  /** Active MoMo push details when the backend chose MoMo as the gateway. */
  readonly momoPending = signal<{
    reference: string;
    payerMsisdn: string;
    amountLabel: string;
  } | null>(null);

  async pay(): Promise<void> {
    const plan = this.selectedPlan();
    if (!plan || this.suiteStillActive()) return;

    const picker = this.picker();
    const ready = picker ? await picker.validate() : false;
    if (!ready) return;
    const choice = this.paymentChoice();
    if (!choice) return;

    const callbackUrl = `${window.location.origin}/suite-access/checkout/complete`;
    const msisdn = choice.payerMsisdn ?? this.defaultPayerMsisdn() ?? undefined;

    this.busy.set(true);
    this.error.set(null);
    this.momoPending.set(null);

    this.borderboxApi
      .initiateSuiteCheckout(plan.id, callbackUrl, {
        provider: choice.provider,
        payerMsisdn: msisdn,
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          if (res.provider === 'momo') {
            this.momoPending.set({
              reference: res.reference,
              payerMsisdn: msisdn ?? 'your phone',
              amountLabel: `R ${res.amountZar.toFixed(2)}`,
            });
            return;
          }
          this.onPaystackInitiated(res);
        },
        error: (err: Error) => {
          this.busy.set(false);
          this.error.set(err?.message ?? 'Could not start checkout.');
        },
      });
  }

  onMomoSucceeded(reference: string): void {
    this.momoPending.set(null);
    // Trigger the same complete-checkout path Paystack takes on redirect.
    this.borderboxApi.completeSuiteCheckout(reference).subscribe({
      next: () => this.router.navigateByUrl('/suite-access/checkout/complete?provider=momo'),
      error: (err: Error) => this.error.set(err?.message ?? 'Could not finalise MoMo payment.'),
    });
  }

  onMomoFailed(message: string): void {
    this.momoPending.set(null);
    this.error.set(message);
  }

  onMomoCancelled(): void {
    this.momoPending.set(null);
  }

  private onPaystackInitiated(res: InitiateSuiteCheckoutDto): void {
    this.paystack
      .start(res)
      .then((outcome) => {
        if (outcome.status === 'success') {
          // Hand off to /suite-access/checkout/complete which verifies the
          // transaction with Paystack server-side and activates the suite.
          this.router.navigateByUrl(
            `/suite-access/checkout/complete?reference=${encodeURIComponent(outcome.reference)}`,
          );
          return;
        }
        if (outcome.status === 'error') {
          this.error.set(outcome.message);
        }
        // 'cancelled' → user closed the popup, leave them on this page so
        // they can retry without losing their plan / payment selection.
      })
      .catch(() => {
        window.location.href = res.authorizationUrl;
      });
  }

  private formatDate(d: Date): string {
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
