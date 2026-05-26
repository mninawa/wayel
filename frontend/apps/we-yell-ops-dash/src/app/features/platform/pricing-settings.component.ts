import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { platformRoutes } from '../../types/platform.types';
import { PricingEditorPanelComponent } from './pricing-editor-panel.component';

/**
 * Route page for `/ops/platform/pricing`. Page chrome only — the actual
 * pricing form lives in {@link PricingEditorPanelComponent} so the same
 * editor can be reused as a tab inside the Regional Suite Configuration page.
 */
@Component({
  selector: 'ops-pricing-settings',
  standalone: true,
  imports: [RouterLink, PricingEditorPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pricing-settings.component.html',
  styleUrl: './pricing-settings.component.css',
})
export class PricingSettingsComponent {
  readonly routes = platformRoutes;
}
