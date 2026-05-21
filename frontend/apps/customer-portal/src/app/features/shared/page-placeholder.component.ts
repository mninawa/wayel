import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Temporary scaffold until WeYell screens are implemented. */
@Component({
  selector: 'app-page-placeholder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="placeholder">
      <p class="eyebrow">WeYell · Phase 1</p>
      <h1>{{ title }}</h1>
      <p class="route">Route: <code>{{ routePath }}</code></p>
      @if (note) {
        <p class="note">{{ note }}</p>
      }
    </section>
  `,
  styles: `
    .placeholder {
      padding: 2rem;
      max-width: 48rem;
    }
    .eyebrow {
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 0.5rem;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 1.75rem;
      font-weight: 600;
    }
    .route {
      color: #475569;
      margin: 0 0 1rem;
    }
    code {
      font-family: ui-monospace, monospace;
      font-size: 0.9em;
    }
    .note {
      color: #334155;
      line-height: 1.5;
    }
  `,
})
export class PagePlaceholderComponent {
  private readonly route = inject(ActivatedRoute);
  readonly title = this.route.snapshot.data['placeholderTitle'] as string;
  readonly routePath = this.route.snapshot.data['placeholderRoute'] as string;
  readonly note = this.route.snapshot.data['placeholderNote'] as string | undefined;
}
