import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'ops-coming-soon',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="soon ops-card ops-card-pad">
      <span class="material-icons-outlined icon">{{ pageIcon }}</span>
      <h1>{{ pageTitle }}</h1>
      <p>{{ pageDescription }}</p>
      <a routerLink="/" class="ops-btn ops-btn-outline">Back to overview</a>
    </section>
  `,
  styles: `
    .soon { max-width: 520px; margin: 2rem auto; text-align: center; }
    .icon { font-size: 3rem; color: var(--ops-muted); opacity: 0.5; }
    h1 { margin: 0.5rem 0 0.35rem; font-size: 1.25rem; }
    p { margin: 0 0 1.25rem; color: var(--ops-muted); font-size: 0.9rem; line-height: 1.5; }
  `,
})
export class OpsComingSoonComponent {
  private readonly route = inject(ActivatedRoute);

  readonly pageTitle =
    (this.route.snapshot.data['title'] as string | undefined) ?? 'Coming soon';
  readonly pageDescription =
    (this.route.snapshot.data['description'] as string | undefined) ??
    'This module is coming soon.';
  readonly pageIcon =
    (this.route.snapshot.data['icon'] as string | undefined) ?? 'construction';
}
