import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { RECEIVING_BASE } from './types/receiving.types';

export const routes: Routes = [
  { path: '', redirectTo: RECEIVING_BASE, pathMatch: 'full' },
  {
    path: 'ops/receiving',
    children: [
      {
        path: '',
        title: 'Receiving dashboard',
        loadComponent: () =>
          import('./features/overview/receiving-dashboard.component').then(
            (m) => m.ReceivingDashboardComponent,
          ),
      },
      {
        path: 'queue',
        redirectTo: '',
        pathMatch: 'full',
      },
      {
        path: 'new',
        title: 'Receive new parcel',
        loadComponent: () =>
          import('./features/parcel-receive/parcel-receive.component').then(
            (m) => m.ParcelReceiveComponent,
          ),
      },
      {
        path: 'matching/:parcelId',
        title: 'Parcel matching',
        loadComponent: () =>
          import('./features/parcel-matching/parcel-matching.component').then(
            (m) => m.ParcelMatchingComponent,
          ),
      },
      {
        path: 'parcels/:parcelId',
        title: 'Parcel details',
        loadComponent: () =>
          import('./features/parcel-detail/parcel-detail.component').then(
            (m) => m.ParcelDetailComponent,
          ),
      },
      {
        path: 'parcels/:parcelId/inspection',
        title: 'Inspection',
        loadComponent: () =>
          import('./features/inspection/inspection.component').then(
            (m) => m.InspectionComponent,
          ),
      },
      {
        path: 'parcels/:parcelId/invoice',
        title: 'Invoice verification',
        loadComponent: () =>
          import('./features/invoice-verification/invoice-verification.component').then(
            (m) => m.InvoiceVerificationComponent,
          ),
      },
      {
        path: 'exceptions',
        title: 'Exceptions queue',
        loadComponent: () =>
          import('./features/exceptions/exceptions-queue.component').then(
            (m) => m.ExceptionsQueueComponent,
          ),
      },
      {
        path: 'ready-for-quote',
        title: 'Ready for quote',
        loadComponent: () =>
          import('./features/ready-for-quote/ready-for-quote.component').then(
            (m) => m.ReadyForQuoteComponent,
          ),
      },
    ],
  },
  {
    path: 'ops/warehouse',
    children: [
      {
        path: '',
        title: 'Warehouse board',
        loadComponent: () =>
          import('./features/warehouse/warehouse-dashboard.component').then(
            (m) => m.WarehouseDashboardComponent,
          ),
      },
      {
        path: 'locations',
        title: 'Warehouse locations',
        loadComponent: () =>
          import('./features/warehouse/warehouse-locations.component').then(
            (m) => m.WarehouseLocationsComponent,
          ),
      },
      {
        path: 'storage/:parcelId',
        title: 'Assign storage',
        loadComponent: () =>
          import('./features/warehouse/warehouse-storage-assignment.component').then(
            (m) => m.WarehouseStorageAssignmentComponent,
          ),
      },
      {
        path: 'movements',
        title: 'Movement log',
        loadComponent: () =>
          import('./features/warehouse/warehouse-movements.component').then(
            (m) => m.WarehouseMovementsComponent,
          ),
      },
      {
        path: 'picking',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'picking/:taskId',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'packing',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'packing/:shipmentId',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dispatch-staging',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'manifests',
        title: 'Dispatch manifests',
        loadComponent: () =>
          import('./features/warehouse/warehouse-manifests.component').then(
            (m) => m.WarehouseManifestsComponent,
          ),
      },
    ],
  },
  {
    path: 'ops/consolidation',
    children: [
      { path: '', redirectTo: '/ops/warehouse', pathMatch: 'full' },
      { path: 'inventory', redirectTo: '/ops/warehouse/locations', pathMatch: 'full' },
      { path: 'ready-shipments', redirectTo: '/ops/warehouse', pathMatch: 'full' },
    ],
  },
  {
    path: 'ops/collection',
    title: 'Collection board',
    loadComponent: () =>
      import('./features/collection/collection-dashboard.component').then(
        (m) => m.CollectionDashboardComponent,
      ),
  },
  {
    path: 'ops/accounts',
    children: [
      {
        path: '',
        title: 'Accounts & Suites',
        loadComponent: () =>
          import('./features/accounts/accounts-list.component').then((m) => m.AccountsListComponent),
      },
      {
        path: ':userId',
        title: 'Customer account',
        loadComponent: () =>
          import('./features/accounts/account-detail.component').then((m) => m.AccountDetailComponent),
      },
    ],
  },
  {
    path: 'ops/kyc',
    title: 'KYC review',
    loadComponent: () =>
      import('./features/kyc-review/kyc-review.component').then((m) => m.KycReviewComponent),
  },
  {
    path: 'ops/shipments',
    title: 'Shipment status',
    loadComponent: () =>
      import('./features/shipment-status/shipment-status.component').then(
        (m) => m.ShipmentStatusComponent,
      ),
  },
  {
    path: 'ops/platform',
    title: 'Platform dashboard',
    loadComponent: () =>
      import('./features/platform/platform-dashboard.component').then(
        (m) => m.PlatformDashboardComponent,
      ),
  },
  {
    path: 'ops/platform/suites',
    title: 'Suite platform configuration',
    loadComponent: () =>
      import('./features/platform/suite-platform-settings.component').then(
        (m) => m.SuitePlatformSettingsComponent,
      ),
  },
  {
    // Pricing now lives as a tab on `/ops/platform/suites?tab=pricing`.
    // Keep the legacy path as a redirect so bookmarks / external links
    // land users on the correct tab rather than the catch-all.
    path: 'ops/platform/pricing',
    redirectTo: () => inject(Router).parseUrl('/ops/platform/suites?tab=pricing'),
  },
  {
    path: 'ops/platform/plans',
    title: 'Suite plans',
    loadComponent: () =>
      import('./features/platform/suite-plans.component').then(
        (m) => m.SuitePlansComponent,
      ),
  },
  {
    path: 'ops/settings',
    title: 'Team & access',
    loadComponent: () =>
      import('./features/settings/ops-team-settings.component').then((m) => m.OpsTeamSettingsComponent),
  },
  {
    path: 'connect',
    title: 'Warehouse access',
    loadComponent: () =>
      import('./layout/ops-connect.component').then((m) => m.OpsConnectComponent),
  },
  // Legacy redirects
  { path: 'receive', redirectTo: 'ops/receiving/new', pathMatch: 'full' },
  { path: 'parcels/:parcelId', redirectTo: 'ops/receiving/parcels/:parcelId' },
  { path: '**', redirectTo: RECEIVING_BASE },
];
