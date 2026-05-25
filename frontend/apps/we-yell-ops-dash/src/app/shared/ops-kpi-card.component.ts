import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ops-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="kpi">
      <div class="kpi-icon" [class]="tone()">
        <span class="material-icons-outlined">{{ icon() }}</span>
      </div>
      <div class="kpi-body">
        <span class="kpi-label">{{ label() }}</span>
        <strong class="kpi-value">{{ value() }}</strong>
      </div>
    </article>
  `,
  styles: `
    .kpi {
      background: var(--ops-surface);
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius);
      padding: 1rem 1.1rem;
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
      box-shadow: var(--ops-shadow);
    }
    .kpi-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .kpi-icon .material-icons-outlined { font-size: 22px; }
    .kpi-icon.teal { background: #e0f2fe; color: #0369a1; }
    .kpi-icon.orange { background: #ffedd5; color: #c2410c; }
    .kpi-icon.amber { background: #fef3c7; color: #b45309; }
    .kpi-icon.blue { background: #dbeafe; color: #1d4ed8; }
    .kpi-icon.red { background: #fee2e2; color: #b91c1c; }
    .kpi-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .kpi-label { font-size: 0.78rem; color: var(--ops-muted); font-weight: 600; }
    .kpi-value { font-size: 1.5rem; line-height: 1.1; color: var(--ops-text); }
  `,
})
export class OpsKpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly icon = input('inventory_2');
  readonly tone = input<'teal' | 'orange' | 'amber' | 'blue' | 'red'>('teal');
}
