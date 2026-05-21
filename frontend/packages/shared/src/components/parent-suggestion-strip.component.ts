import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  signal,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  listSuggestionsForChild,
  listSuggestionsForParent,
  type SuggestionRow,
} from '@wayel/shared/services/workspace-partnership';
import { formatMoney } from '@wayel/shared/services/workspace-program';

/**
 * Parent-facing suggestion strip.
 *
 * Used in two places:
 *   - `/parent/children` — pass `parentId` only; renders all suggestions
 *     across the family with a "Suggested for your family" header.
 *   - `/parent/children/:id` — pass `parentId` AND `parentChildId`; renders
 *     suggestions scoped to that child only with a child-aware header.
 *
 * Empty state collapses the strip entirely (returns `null` template) so
 * pages don't show a noisy "no suggestions" panel — they just don't see
 * the section at all.
 */
@Component({
  selector: 'app-parent-suggestion-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (rows().length > 0) {
      <section class="strip" aria-labelledby="strip-title">
        <header class="strip-head">
          <div>
            <h2 id="strip-title" class="strip-title">
              <span class="material-icons-outlined" aria-hidden="true">
                {{ parentChildId ? 'recommend' : 'auto_awesome' }}
              </span>
              {{ headerText() }}
            </h2>
            <p class="strip-sub">{{ leadText() }}</p>
          </div>
        </header>

        <ul class="card-row" role="list">
          @for (row of rows(); track row.partnership.id) {
            <li class="card" role="listitem">
              <div class="card-top">
                <div
                  class="logo-pill"
                  [style.background]="row.partner.accentColor"
                  aria-hidden="true"
                >
                  {{ initials(row.partner.name) }}
                </div>
                @if (row.partnership.badge === 'preferred') {
                  <span class="badge badge-preferred">
                    <span class="material-icons-outlined" aria-hidden="true">star</span>
                    Preferred
                  </span>
                } @else if (row.partnership.badge === 'sister_school') {
                  <span class="badge badge-sister">
                    <span class="material-icons-outlined" aria-hidden="true">school</span>
                    Sister school
                  </span>
                }
              </div>

              <h3 class="card-title">{{ row.partner.name }}</h3>
              <p class="card-meta">
                {{ row.partner.tagline || row.partner.area + ' · ' + row.partner.city }}
              </p>

              <p class="card-pitch">"{{ row.partnership.pitch }}"</p>

              <p class="card-because">
                <span class="material-icons-outlined because-icon" aria-hidden="true">link</span>
                <span class="because-text">
                  Recommended by <strong>{{ row.curator.name }}</strong>
                  @if (row.matchedProgram) {
                    · because of {{ row.child.displayName }}'s
                    <em>{{ row.matchedProgram.name }}</em>
                  } @else {
                    · for {{ row.child.displayName }}
                  }
                </span>
              </p>

              <footer class="card-foot">
                <span class="from-fee">
                  @if (row.partnerFromFee) {
                    From {{ feeLabel(row.partnerFromFee.amount, row.partnerFromFee.currency) }}/{{ row.partnerFromFee.cadence }}
                  } @else {
                    Pricing varies
                  }
                </span>
                <a
                  class="cta"
                  [routerLink]="['/parent/subscribe']"
                  [queryParams]="{
                    institutionId: row.partner.id,
                    suggestedBy: row.curator.id,
                    parentChildId: row.child.id
                  }"
                >
                  Have a look
                  <span class="material-icons-outlined" aria-hidden="true">arrow_forward</span>
                </a>
              </footer>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .strip {
      background: linear-gradient(135deg, #fffbeb 0%, #fff 70%);
      border: 1px solid rgba(217, 119, 6, 0.18);
      border-radius: 14px; padding: 1rem 1.1rem;
      margin: 0 0 1.25rem;
    }
    .strip-head { margin-bottom: 0.75rem; }
    .strip-title {
      margin: 0; font-size: 1.05rem;
      display: inline-flex; align-items: center; gap: 0.45rem;
    }
    .strip-title .material-icons-outlined { color: #d97706; }
    .strip-sub { color: var(--nk-muted); margin: 0.2rem 0 0; font-size: 0.85rem; max-width: 65ch; }

    .card-row {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: 0.85rem;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }
    .card {
      background: #fff;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 12px; padding: 0.85rem 0.95rem;
      display: flex; flex-direction: column; gap: 0.5rem;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.06);
    }
    .card-top {
      display: flex; align-items: center; justify-content: space-between;
      gap: 0.5rem;
    }
    .logo-pill {
      width: 38px; height: 38px; border-radius: 10px;
      display: grid; place-items: center;
      color: #1f2937; font-weight: 700; font-size: 0.8rem;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 0.25rem;
      padding: 0.15rem 0.55rem; border-radius: 999px;
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge .material-icons-outlined { font-size: 0.95rem; }
    .badge-preferred { background: rgba(34, 197, 94, 0.15); color: #15803d; }
    .badge-sister { background: rgba(99, 102, 241, 0.15); color: #4338ca; }

    .card-title { margin: 0; font-size: 0.98rem; color: var(--sd-color-text, #1f2937); }
    .card-meta { margin: 0; color: var(--nk-muted); font-size: 0.8rem; }
    .card-pitch {
      margin: 0; font-style: italic; font-size: 0.85rem;
      background: rgba(0,0,0,0.025); padding: 0.5rem 0.65rem;
      border-radius: 8px; border-left: 3px solid rgba(217, 119, 6, 0.4);
      color: var(--sd-color-text, #1f2937); line-height: 1.4;
    }
    .card-because {
      margin: 0; font-size: 0.78rem; color: var(--nk-muted);
      display: flex; align-items: flex-start; gap: 0.35rem; line-height: 1.45;
    }
    .card-because .because-icon { font-size: 0.95rem; margin-top: 2px; flex-shrink: 0; }
    .card-because .because-text {
      flex: 1; min-width: 0;
      overflow-wrap: anywhere; word-break: normal;
    }
    .card-because strong { color: var(--sd-color-text, #1f2937); font-weight: 600; }
    .card-because em { font-style: italic; color: var(--sd-color-text, #1f2937); }

    .card-foot {
      display: flex; align-items: center; justify-content: space-between;
      gap: 0.5rem; margin-top: auto; padding-top: 0.4rem;
      border-top: 1px dashed var(--surface-border, #e5e7eb);
    }
    .from-fee { color: var(--sd-color-text, #1f2937); font-weight: 600; font-size: 0.8rem; }
    .cta {
      display: inline-flex; align-items: center; gap: 0.2rem;
      color: var(--sd-color-accent, #d97706); font-weight: 600;
      text-decoration: none; font-size: 0.85rem;
    }
    .cta:hover { text-decoration: underline; }
    .cta .material-icons-outlined { font-size: 1rem; }
  `,
})
export class ParentSuggestionStripComponent implements OnChanges {
  @Input() parentId: string | null = null;
  /** When set, suggestions are scoped to this child only. */
  @Input() parentChildId: string | null = null;
  /** Optional override for the header copy. */
  @Input() variant: 'family' | 'child' | 'auto' = 'auto';

  /** Bumped when inputs change, so the computed re-fetches. */
  private readonly version = signal(0);

  protected readonly rows = computed<SuggestionRow[]>(() => {
    this.version();
    if (!this.parentId) return [];
    return this.parentChildId
      ? listSuggestionsForChild(this.parentId, this.parentChildId)
      : listSuggestionsForParent(this.parentId);
  });

  protected readonly headerText = computed<string>(() => {
    const v = this.effectiveVariant();
    return v === 'child' ? 'Partner institutions' : 'Suggested for your family';
  });

  protected readonly leadText = computed<string>(() => {
    const n = this.rows().length;
    const v = this.effectiveVariant();
    if (v === 'child') {
      return `${n} institution${n === 1 ? '' : 's'} that ${this.firstChildName()}'s teachers recommend.`;
    }
    return `${n} institution${n === 1 ? '' : 's'} curated by the schools your children already attend.`;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['parentId'] || changes['parentChildId']) {
      this.version.update((v) => v + 1);
    }
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join('');
  }

  protected feeLabel(amount: number, currency: string): string {
    return formatMoney(amount, currency);
  }

  private effectiveVariant(): 'family' | 'child' {
    if (this.variant !== 'auto') return this.variant;
    return this.parentChildId ? 'child' : 'family';
  }

  private firstChildName(): string {
    const r = this.rows();
    return r.length > 0 ? r[0].child.displayName : 'your child';
  }
}
