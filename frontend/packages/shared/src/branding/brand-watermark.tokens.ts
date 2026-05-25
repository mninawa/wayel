import { InjectionToken } from '@angular/core';

export interface BrandWatermarkOptions {
  /** Absolute or root-relative URL to the watermark image. Omit to hide. */
  imageUrl?: string | null;
}

export const BRAND_WATERMARK_OPTIONS = new InjectionToken<BrandWatermarkOptions>(
  'BRAND_WATERMARK_OPTIONS',
  {
    factory: () => ({}),
  },
);
