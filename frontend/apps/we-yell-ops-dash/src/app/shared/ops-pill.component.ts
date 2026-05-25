import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type OpsPillTone = 'green' | 'orange' | 'red' | 'blue' | 'gray' | 'yellow';

@Component({
  selector: 'ops-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="tone()">{{ label() }}</span>`,
  styles: `
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .green { background: #dcfce7; color: #15803d; }
    .orange { background: #ffedd5; color: #c2410c; }
    .red { background: #fee2e2; color: #b91c1c; }
    .blue { background: #dbeafe; color: #1d4ed8; }
    .yellow { background: #fef9c3; color: #a16207; }
    .gray { background: #f1f5f9; color: #475569; }
  `,
})
export class OpsPillComponent {
  readonly label = input.required<string>();
  readonly tone = input<OpsPillTone>('gray');
}

export function pillToneForMatch(status: string): OpsPillTone {
  if (status === 'Match') return 'green';
  if (status === 'Partial Match') return 'orange';
  if (status === 'No Match') return 'red';
  return 'gray';
}

export function pillToneForInvoice(status: string): OpsPillTone {
  if (status === 'Invoiced') return 'green';
  if (status === 'Awaiting Invoice') return 'orange';
  if (status === 'Rejected') return 'red';
  if (status === 'Pending Review') return 'yellow';
  return 'gray';
}

export function pillToneForParcelStatus(status: string): OpsPillTone {
  if (status === 'ReadyToShip' || statusLabelIncludes(status, 'Ready')) return 'blue';
  if (status === 'Delivered') return 'green';
  if (statusLabelIncludes(status, 'Exception')) return 'red';
  if (status === 'AwaitingInvoice') return 'orange';
  return 'blue';
}

function statusLabelIncludes(status: string, needle: string): boolean {
  return status.toLowerCase().includes(needle.toLowerCase());
}
