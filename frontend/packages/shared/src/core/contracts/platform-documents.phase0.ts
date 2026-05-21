/**
 * GET /api/platform/tenants/{tenantId}/documents
 *   ?search=&status=&page=&pageSize=
 */
export type Phase0TenantDocumentStatus = 'indexed' | 'pending';

export interface Phase0TenantDocumentDto {
  id: string;
  tenantId: string;
  title: string;
  uploadedAt: string;
  status: Phase0TenantDocumentStatus;
}

export interface Phase0ListTenantDocumentsQuery {
  search?: string;
  status?: Phase0TenantDocumentStatus;
  page?: number;
  pageSize?: number;
}

/** Paged shape mirrors `Phase0PagedResult<T>` for tenants — keep schemas symmetric. */
export interface Phase0PagedTenantDocuments {
  items: Phase0TenantDocumentDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}
