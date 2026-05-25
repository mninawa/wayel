import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface SuitePlatformRegionSummaryDto {
  regionCode: string;
  destinationCountryLabel: string;
  corridorLabel: string;
  originCountryCode: string;
  isActive: boolean;
  assignedSuiteCount: number;
  totalSuiteCapacity: number;
  availableSuiteCount: number;
  numberPrefix: string;
  updatedAtUtc: string | null;
}

export interface SuitePlatformConfigDto {
  regionCode: string;
  destinationCountryLabel: string;
  corridorLabel: string;
  originCountryCode: string;
  isActive: boolean;
  warehouseName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
  totalSuiteCapacity: number;
  assignedSuiteCount: number;
  availableSuiteCount: number;
  numberPrefix: string;
  generationMode: 'UserIdSuffix' | 'Sequential';
  userIdSuffixLength: number;
  sequencePadLength: number;
  nextSequenceNumber: number;
  previewNextSuiteNumber: string;
  updatedAtUtc: string;
}

export type UpdateSuitePlatformConfigRequest = Omit<
  SuitePlatformConfigDto,
  | 'regionCode'
  | 'destinationCountryLabel'
  | 'corridorLabel'
  | 'originCountryCode'
  | 'assignedSuiteCount'
  | 'availableSuiteCount'
  | 'previewNextSuiteNumber'
  | 'updatedAtUtc'
>;

export const SUITE_REGION_FLAGS: Record<string, string> = {
  SZ: '🇸🇿',
  BW: '🇧🇼',
  NA: '🇳🇦',
};

@Injectable({ providedIn: 'root' })
export class SuitePlatformApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/platform/suites`;

  listRegions(): Observable<SuitePlatformRegionSummaryDto[]> {
    return this.http.get<SuitePlatformRegionSummaryDto[]>(`${this.base}/regions`, {
      headers: buildOpsHeaders(),
    });
  }

  getConfig(regionCode: string): Observable<SuitePlatformConfigDto> {
    return this.http.get<SuitePlatformConfigDto>(`${this.base}/regions/${regionCode}`, {
      headers: buildOpsHeaders(),
    });
  }

  updateConfig(
    regionCode: string,
    body: UpdateSuitePlatformConfigRequest,
  ): Observable<SuitePlatformConfigDto> {
    return this.http.put<SuitePlatformConfigDto>(`${this.base}/regions/${regionCode}`, body, {
      headers: buildOpsHeaders(),
    });
  }
}
