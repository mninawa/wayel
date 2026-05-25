import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';
import type { OpsPagedResult } from './receiving-api.service';

export interface OpsWarehouseZoneCapacityDto {
  zone: string;
  totalCapacity: number;
  occupancy: number;
  utilizationPercent: number;
  locationCount: number;
}

export interface OpsWarehousePendingTaskDto {
  taskType: string;
  taskId: string;
  displayId: string;
  status: string;
  priority: string;
  customerDisplayName: string;
  createdAtUtc: string;
}

export interface OpsWarehouseActivityDto {
  movementId: string;
  parcelId: string;
  parcelDisplayId: string | null;
  movementType: string;
  toLocationId: string;
  movedBy: string | null;
  movedAtUtc: string;
}

export interface OpsWarehouseDashboardDto {
  storedParcels: number;
  pendingPickTasks: number;
  pendingPackingTasks: number;
  readyForDispatch: number;
  onHoldParcels: number;
  zoneCapacities: OpsWarehouseZoneCapacityDto[];
  pendingTasks: OpsWarehousePendingTaskDto[];
  recentActivity: OpsWarehouseActivityDto[];
}

export interface OpsWarehouseBoardCardDto {
  cardKey: string;
  cardType: 'PARCEL' | 'SHIPMENT';
  columnId: string;
  parcelId: string | null;
  shipmentId: string | null;
  taskId: string | null;
  displayId: string;
  title: string;
  subtitle: string | null;
  statusLabel: string;
  locationId: string | null;
  suiteNumber: string | null;
  retailer: string | null;
  customerDisplayName: string | null;
  destination: string | null;
  deliveryMethod: string | null;
  parcelCount: number | null;
  weightKg: number | null;
  assignedTo: string | null;
  dueAtUtc: string | null;
  eventAtUtc: string | null;
  isOverdue: boolean;
  issueSummary: string | null;
  trackingNumber?: string | null;
  receivedAtUtc?: string | null;
  updatedAtUtc?: string | null;
  dispatchByUtc?: string | null;
  overdueMinutes?: number | null;
  pickupLabel?: string | null;
  invoiceStatusLabel?: string | null;
  inspectionLabel?: string | null;
  coverPhotoId?: string | null;
}

export interface OpsWarehouseBoardColumnDto {
  columnId: string;
  label: string;
  subtitle: string;
  count: number;
  overdueCount: number;
  cards: OpsWarehouseBoardCardDto[];
}

export interface OpsWarehouseBoardDto {
  columns: OpsWarehouseBoardColumnDto[];
  exceptionCards: OpsWarehouseBoardCardDto[];
}

export interface OpsWarehouseBoardMoveResultDto {
  message: string;
  fromColumnId: string;
  toColumnId: string;
}

export interface OpsWarehouseLocationDto {
  locationId: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  capacity: number;
  occupancy: number;
  storageType: string;
  status: string;
  updatedAtUtc: string;
}

export interface CreateWarehouseLocationRequest {
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  capacity: number;
  storageType: string;
  status?: string;
}

export interface UpdateWarehouseLocationRequest {
  capacity?: number;
  storageType?: string;
  status?: string;
}

export interface OpsWarehouseMovementDto {
  movementId: string;
  parcelId: string;
  parcelDisplayId: string | null;
  fromLocationId: string | null;
  toLocationId: string;
  movementType: string;
  movedBy: string | null;
  movedAtUtc: string;
  notes: string | null;
}

export interface CreateWarehouseMovementRequest {
  parcelId: string;
  toLocationId: string;
  movementType: string;
  notes?: string | null;
}

export interface OpsPickTaskParcelLineDto {
  parcelId: string;
  displayId: string;
  itemName: string;
  locationId: string | null;
  pickStatus: string;
  pickedBy: string | null;
  pickedAtUtc: string | null;
  issueReason: string | null;
}

export interface OpsPickTaskDto {
  pickTaskId: string;
  displayId: string;
  shipmentId: string;
  status: string;
  assignedTo: string | null;
  customerDisplayName: string;
  suiteNumber: string;
  priority: string;
  parcels: OpsPickTaskParcelLineDto[];
  createdAtUtc: string;
  completedAtUtc: string | null;
}

export interface MarkParcelPickedRequest {
  parcelId: string;
  issueReason?: string | null;
}

export interface OpsPackingTaskDto {
  packingTaskId: string;
  shipmentId: string;
  shipmentDisplayId: string;
  status: string;
  dispatchStagingStatus: string;
  customerDisplayName: string;
  destination: string;
  deliveryMethod: string;
  packageCount: number;
  finalWeightKg: number | null;
  finalDimensionsLabel: string | null;
  packagingType: string | null;
  sealed: boolean;
  volumetricWeightKg: number | null;
  chargeableWeightKg: number | null;
  quotedWeightKg: number | null;
  varianceStatus: string;
  notes: string | null;
  createdAtUtc: string;
  completedAtUtc: string | null;
}

export interface CompletePackingRequest {
  finalWeightKg: number;
  finalDimensionsLabel: string;
  packagingType: string;
  packageCount?: number;
  notes?: string | null;
}

export interface OpsDispatchStagingItemDto {
  shipmentId: string;
  shipmentDisplayId: string;
  customerDisplayName: string;
  suiteNumber: string;
  deliveryMethod: string;
  dispatchStagingStatus: string;
  parcelCount: number;
  totalWeightKg: number;
  readyAtUtc: string | null;
}

export interface OpsDispatchManifestDto {
  manifestId: string;
  displayId: string;
  courier: string;
  dispatchDate: string;
  pickupWindow: string | null;
  status: string;
  shipmentIds: string[];
  shipmentCount: number;
  proofOfHandover: string | null;
  createdAtUtc: string;
  handedOverAtUtc: string | null;
}

export interface CreateManifestRequest {
  courier: string;
  dispatchDate: string;
  pickupWindow?: string | null;
  shipmentIds: string[];
}

export interface OpsDispatchManifestShipmentRowDto {
  shipmentId: string;
  displayId: string;
  customer: string;
  destination: string;
  packages: number;
  weightKg: number;
  labelStatus: string;
}

export interface OpsDispatchManifestHandoverCheckDto {
  label: string;
  done: boolean;
}

export interface OpsDispatchManifestDetailDto {
  manifest: OpsDispatchManifestDto;
  totalWeightKg: number;
  totalPackages: number;
  shipments: OpsDispatchManifestShipmentRowDto[];
  checks: OpsDispatchManifestHandoverCheckDto[];
}

export interface OpsParcelStorageDto {
  parcelId: string;
  displayId: string;
  trackingNumber: string | null;
  customerDisplayName: string;
  suiteNumber: string;
  itemName: string;
  status: string;
  currentLocationId: string | null;
  currentLocationLabel: string | null;
  daysInWarehouse: number;
  eligibleLocations: OpsWarehouseLocationDto[];
  suggestedLocationId: string | null;
  suggestedLocationLabel: string | null;
}

export interface AssignParcelStorageRequest {
  locationId: string;
  notes?: string | null;
}

export interface WarehouseActionResultDto {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class WarehouseApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/warehouse`;

  getDashboard(opsKey: string): Observable<OpsWarehouseDashboardDto> {
    return this.http.get<OpsWarehouseDashboardDto>(`${this.base}/dashboard`, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  getBoard(
    opsKey: string,
    search?: string,
    destination?: string,
    service?: string,
  ): Observable<OpsWarehouseBoardDto> {
    const params: Record<string, string> = {};
    if (search?.trim()) params['search'] = search.trim();
    if (destination?.trim()) params['destination'] = destination.trim();
    if (service?.trim()) params['service'] = service.trim();
    return this.http.get<OpsWarehouseBoardDto>(`${this.base}/board`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  moveBoardItem(
    opsKey: string,
    body: {
      cardKey: string;
      fromColumnId: string;
      toColumnId: string;
      locationId?: string | null;
      reason?: string | null;
    },
  ): Observable<OpsWarehouseBoardMoveResultDto> {
    return this.http.post<OpsWarehouseBoardMoveResultDto>(`${this.base}/board/move`, body, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  listLocations(
    opsKey: string,
    page = 1,
    pageSize = 25,
    zone?: string,
    status?: string,
    search?: string,
  ): Observable<OpsPagedResult<OpsWarehouseLocationDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    const zoneTrim = zone?.trim();
    const statusTrim = status?.trim();
    const searchTrim = search?.trim();
    if (zoneTrim) params['zone'] = zoneTrim;
    if (statusTrim) params['status'] = statusTrim;
    if (searchTrim) params['search'] = searchTrim;
    return this.http.get<OpsPagedResult<OpsWarehouseLocationDto>>(`${this.base}/locations`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  createLocation(
    body: CreateWarehouseLocationRequest,
    opsKey: string,
  ): Observable<OpsWarehouseLocationDto> {
    return this.http.post<OpsWarehouseLocationDto>(`${this.base}/locations`, body, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  updateLocation(
    locationId: string,
    body: UpdateWarehouseLocationRequest,
    opsKey: string,
  ): Observable<OpsWarehouseLocationDto> {
    return this.http.patch<OpsWarehouseLocationDto>(`${this.base}/locations/${locationId}`, body, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  listMovements(
    opsKey: string,
    page = 1,
    pageSize = 25,
    parcelId?: string,
    movementType?: string,
    fromUtc?: string,
    toUtc?: string,
  ): Observable<OpsPagedResult<OpsWarehouseMovementDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (parcelId?.trim()) params['parcelId'] = parcelId.trim();
    if (movementType?.trim()) params['movementType'] = movementType.trim();
    if (fromUtc?.trim()) params['fromUtc'] = fromUtc.trim();
    if (toUtc?.trim()) params['toUtc'] = toUtc.trim();
    return this.http.get<OpsPagedResult<OpsWarehouseMovementDto>>(`${this.base}/movements`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  createMovement(
    body: CreateWarehouseMovementRequest,
    opsKey: string,
  ): Observable<OpsWarehouseMovementDto> {
    return this.http.post<OpsWarehouseMovementDto>(`${this.base}/movements`, body, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  listPickingTasks(
    opsKey: string,
    page = 1,
    pageSize = 25,
    status?: string,
  ): Observable<OpsPagedResult<OpsPickTaskDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status?.trim()) params['status'] = status.trim();
    return this.http.get<OpsPagedResult<OpsPickTaskDto>>(`${this.base}/picking-tasks`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  getPickingTask(taskId: string, opsKey: string): Observable<OpsPickTaskDto> {
    return this.http.get<OpsPickTaskDto>(`${this.base}/picking-tasks/${taskId}`, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  markParcelPicked(
    taskId: string,
    body: MarkParcelPickedRequest,
    opsKey: string,
  ): Observable<OpsPickTaskDto> {
    return this.http.post<OpsPickTaskDto>(
      `${this.base}/picking-tasks/${taskId}/mark-picked`,
      body,
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  listPackingTasks(
    opsKey: string,
    page = 1,
    pageSize = 25,
    status?: string,
  ): Observable<OpsPagedResult<OpsPackingTaskDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status?.trim()) params['status'] = status.trim();
    return this.http.get<OpsPagedResult<OpsPackingTaskDto>>(`${this.base}/packing-tasks`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  getPackingTask(taskId: string, opsKey: string): Observable<OpsPackingTaskDto> {
    return this.http.get<OpsPackingTaskDto>(`${this.base}/packing-tasks/${taskId}`, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  completePacking(
    taskId: string,
    body: CompletePackingRequest,
    opsKey: string,
  ): Observable<OpsPackingTaskDto> {
    return this.http.post<OpsPackingTaskDto>(
      `${this.base}/packing-tasks/${taskId}/complete`,
      body,
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  listDispatchStaging(
    opsKey: string,
    page = 1,
    pageSize = 25,
    status?: string,
  ): Observable<OpsPagedResult<OpsDispatchStagingItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (status?.trim()) params['status'] = status.trim();
    return this.http.get<OpsPagedResult<OpsDispatchStagingItemDto>>(`${this.base}/dispatch-staging`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  listManifests(
    opsKey: string,
    page = 1,
    pageSize = 25,
  ): Observable<OpsPagedResult<OpsDispatchManifestDto>> {
    return this.http.get<OpsPagedResult<OpsDispatchManifestDto>>(`${this.base}/manifests`, {
      headers: buildOpsHeaders(opsKey),
      params: { page, pageSize },
    });
  }

  getManifestDetail(manifestId: string, opsKey: string): Observable<OpsDispatchManifestDetailDto> {
    return this.http.get<OpsDispatchManifestDetailDto>(
      `${this.base}/manifests/${manifestId}`,
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  createManifest(body: CreateManifestRequest, opsKey: string): Observable<OpsDispatchManifestDto> {
    return this.http.post<OpsDispatchManifestDto>(`${this.base}/manifests`, body, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  confirmManifestHandover(
    manifestId: string,
    proofOfHandover: string | null,
    opsKey: string,
  ): Observable<OpsDispatchManifestDto> {
    return this.http.post<OpsDispatchManifestDto>(
      `${this.base}/manifests/${manifestId}/confirm-handover`,
      { proofOfHandover },
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  dispatchShipment(shipmentId: string, opsKey: string): Observable<WarehouseActionResultDto> {
    return this.http.post<WarehouseActionResultDto>(
      `${this.base}/shipments/${shipmentId}/dispatch`,
      {},
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  getParcelStorage(parcelId: string, opsKey: string): Observable<OpsParcelStorageDto> {
    return this.http.get<OpsParcelStorageDto>(`${this.base}/storage/${parcelId}`, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  assignParcelStorage(
    parcelId: string,
    body: AssignParcelStorageRequest,
    opsKey: string,
  ): Observable<OpsParcelStorageDto> {
    return this.http.post<OpsParcelStorageDto>(`${this.base}/storage/${parcelId}/assign`, body, {
      headers: buildOpsHeaders(opsKey),
    });
  }
}
