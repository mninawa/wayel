import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface BorderBoxPricingConfigDto {
  chargeVat: boolean;
  chargeWeightSurcharge: boolean;
  pudoFlatFeeZar: number;
  doorToDoorFlatFeeZar: number;
  perKgSurchargeZar: number;
  dutyRate: number;
  vatRate: number;
  dutyGoodsValueThresholdZar: number;
  paymentHandlingFeeRate: number;
  handlingFeeShareZar: number;
  pickupFeeShareZar: number;
  updatedAtUtc: string;
}

export type BorderBoxPricingConfigUpdate = Omit<BorderBoxPricingConfigDto, 'updatedAtUtc'>;

@Injectable({ providedIn: 'root' })
export class PricingOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/pricing`;

  getConfig(): Observable<BorderBoxPricingConfigDto> {
    return this.http.get<BorderBoxPricingConfigDto>(`${this.base}/config`, {
      headers: buildOpsHeaders(),
    });
  }

  updateConfig(body: BorderBoxPricingConfigUpdate): Observable<BorderBoxPricingConfigDto> {
    return this.http.put<BorderBoxPricingConfigDto>(`${this.base}/config`, body, {
      headers: buildOpsHeaders(),
    });
  }
}
