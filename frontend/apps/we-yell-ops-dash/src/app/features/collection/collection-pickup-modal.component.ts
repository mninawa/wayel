import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { OpsCollectionBoardCardDto } from '../../services/collection-api.service';

export interface CollectionPickupConfirm {
  shipmentId: string;
  idDocumentType: 'NationalId' | 'Passport';
  idNumber: string;
  collectorName: string;
}

@Component({
  selector: 'ops-collection-pickup-modal',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pickup-title">
      <div class="modal">
        <header>
          <h2 id="pickup-title">Confirm collection</h2>
          <button type="button" class="icon-btn" (click)="cancelled.emit()" aria-label="Close">
            <span class="material-icons-outlined">close</span>
          </button>
        </header>
        <p class="lead">
          Record ID proof for <strong>{{ card().displayId }}</strong> —
          {{ card().customerDisplayName }} · {{ card().hubName }}
        </p>
        <form (ngSubmit)="submit()" class="form">
          <label>
            Collector name <span class="optional">(optional)</span>
            <input [(ngModel)]="collectorName" name="collectorName" placeholder="If someone else collects" />
          </label>
          <fieldset>
            <legend>ID document type</legend>
            <label class="radio">
              <input type="radio" name="idType" value="NationalId" [(ngModel)]="idDocumentType" />
              National ID
            </label>
            <label class="radio">
              <input type="radio" name="idType" value="Passport" [(ngModel)]="idDocumentType" />
              Passport
            </label>
          </fieldset>
          <label>
            ID / Passport number
            <input
              [(ngModel)]="idNumber"
              name="idNumber"
              required
              minlength="4"
              autocomplete="off"
              placeholder="Enter document number"
            />
          </label>
          @if (error()) {
            <p class="err">{{ error() }}</p>
          }
          <footer>
            <button type="button" class="btn secondary" (click)="cancelled.emit()">Cancel</button>
            <button type="submit" class="btn primary" [disabled]="busy() || idNumber.trim().length < 4">
              Confirm handover
            </button>
          </footer>
        </form>
      </div>
    </div>
  `,
  styles: `
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal {
      width: min(440px, 100%);
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
      padding: 1.25rem;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }
    h2 { margin: 0; font-size: 1.1rem; }
    .lead { margin: 0 0 1rem; font-size: 0.85rem; color: var(--ops-muted); line-height: 1.5; }
    .form { display: flex; flex-direction: column; gap: 0.85rem; }
    label, fieldset { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem; font-weight: 600; color: var(--ops-text); }
    fieldset { border: 1px solid var(--ops-border); border-radius: 10px; padding: 0.65rem 0.75rem; }
    legend { font-size: 0.78rem; font-weight: 600; padding: 0 0.25rem; }
    input[type='text'], input:not([type]) {
      height: 38px;
      border: 1px solid var(--ops-border);
      border-radius: 8px;
      padding: 0 0.65rem;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .radio { flex-direction: row; align-items: center; font-weight: 500; }
    .optional { font-weight: 500; color: var(--ops-muted); }
    footer { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem; }
    .btn {
      height: 38px;
      padding: 0 1rem;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      border: none;
    }
    .btn.primary { background: var(--ops-primary); color: #fff; }
    .btn.primary:disabled { opacity: 0.5; }
    .btn.secondary { background: #f1f5f9; color: var(--ops-text); }
    .icon-btn { border: none; background: transparent; color: var(--ops-muted); }
    .err { margin: 0; color: var(--ops-danger); font-size: 0.8rem; }
  `,
})
export class CollectionPickupModalComponent {
  readonly card = input.required<OpsCollectionBoardCardDto>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<CollectionPickupConfirm>();
  readonly cancelled = output<void>();

  collectorName = '';
  idDocumentType: 'NationalId' | 'Passport' = 'NationalId';
  idNumber = '';

  submit(): void {
    const trimmed = this.idNumber.trim();
    if (trimmed.length < 4) return;
    this.confirmed.emit({
      shipmentId: this.card().shipmentId,
      idDocumentType: this.idDocumentType,
      idNumber: trimmed,
      collectorName: this.collectorName.trim(),
    });
  }
}
