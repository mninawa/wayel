import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch, type WayelAdminHttpError } from './wayel-admin-http';

/**
 * Per-tenant `EVENT_CATEGORY` chip-picker client. Mirrors
 * `Wayel.Api.Endpoints.EventCategoriesEndpoints` 1:1.
 *
 * - `GET  /api/v1/admin/tenants/{id}/event-categories`
 * - `PUT  /api/v1/admin/tenants/{id}/event-categories { items }`
 *
 * Reads are open to any user bound to the tenant (so the parent
 * SPA / mobile can render category chips); mutations require
 * tenant-admin or super-admin.
 */

export interface TenantEventCategoryDto {
  /** Stable upper-snake-case code (e.g. `OPEN_DAY`). */
  code: string;
  displayName: string;
  /** 6-or-8-digit hex (e.g. `#0EA5E9`). Optional. */
  colorHex: string | null;
}

export interface GetTenantEventCategoriesResponse {
  tenantId: string;
  items: TenantEventCategoryDto[];
}

export interface SetTenantEventCategoriesBody {
  items: TenantEventCategoryDto[];
}

export interface SetTenantEventCategoriesResponse {
  tenantId: string;
  items: TenantEventCategoryDto[];
}

/** Local alias for the shared admin HTTP error shape. */
export type WayelEventCategoriesHttpError = WayelAdminHttpError;

const BASE = '/api/v1/admin/tenants';

@Injectable({ providedIn: 'root' })
export class WayelEventCategoriesApiService {
  list(tenantId: string): Promise<GetTenantEventCategoriesResponse> {
    return wayelAdminFetch<GetTenantEventCategoriesResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/event-categories`,
      { method: 'GET' },
    );
  }

  set(
    tenantId: string,
    body: SetTenantEventCategoriesBody,
  ): Promise<SetTenantEventCategoriesResponse> {
    return wayelAdminFetch<SetTenantEventCategoriesResponse>(
      `${BASE}/${encodeURIComponent(tenantId)}/event-categories`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
  }
}

export const useWayelEventCategories = (): WayelEventCategoriesApiService =>
  inject(WayelEventCategoriesApiService);
