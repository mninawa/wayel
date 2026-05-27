import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PickupBranchSummary, PickupLocationConfig } from '../pickup/pickup-location.types';
import { findPickupRegion } from '../pickup/pickup-regions.config';
import { enrichPickupLocation, findPickupConfigById } from '../pickup/pickup-location.utils';
import { PickupLocationCardComponent } from './pickup-location-card.component';

/**
 * Region-aware pickup branch picker with Google Maps cards.
 * Merges API branch summaries with static region configuration.
 */
@Component({
  selector: 'nk-pickup-location-picker',
  standalone: true,
  imports: [PickupLocationCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker" role="radiogroup" [attr.aria-label]="ariaLabel()">
      @for (loc of locations(); track loc.id) {
        <nk-pickup-location-card
          [location]="loc"
          [apiKey]="apiKey()"
          [regionLabel]="regionLabel()"
          [compact]="compact()"
          [showMap]="showMap()"
          [mapHeight]="mapHeight()"
          [selectable]="true"
          [selected]="value() === loc.id"
          (selectedChange)="onSelect($event)"
        />
      }
    </div>
  `,
  styles: `
    .picker {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
      gap: 0.85rem;
    }
  `,
})
export class PickupLocationPickerComponent {
  readonly regionId = input.required<string>();
  readonly branches = input.required<PickupBranchSummary[]>();
  readonly value = input<string | null>(null);
  readonly apiKey = input<string | null | undefined>(null);
  readonly compact = input(false);
  readonly showMap = input(true);
  readonly mapHeight = input(180);
  readonly ariaLabel = input('Pickup location');

  readonly valueChange = output<string>();

  readonly regionLabel = computed(() => {
    const region = findPickupRegion(this.regionId());
    return region ? `${region.flag} ${region.label}` : null;
  });

  readonly locations = computed((): PickupLocationConfig[] => {
    const region = findPickupRegion(this.regionId());
    const configs = region?.locations ?? [];
    return this.branches()
      .map((branch) =>
        enrichPickupLocation(
          branch,
          this.regionId(),
          findPickupConfigById(configs, branch.id),
        ),
      )
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  });

  onSelect(id: string): void {
    this.valueChange.emit(id);
  }
}
