import { Routes } from '@angular/router';
import {
  customerSignedInGuard,
  guestOnlyWithJourneyGuard,
  portalReadyGuard,
  profileCompleteGuard,
  profileOnboardingGuard,
  suitePlanOnboardingGuard,
} from './guards/customer-journey.guard';

/**
 * WeYell customer journey:
 * 1. Sign in with Google (SSO)
 * 2. Complete profile (/onboarding/complete-profile)
 * 3. Choose suite plan + pay (/onboarding/choose-suite-plan → checkout)
 * 4. Portal (/dashboard, …)
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

  {
    path: 'sign-in',
    canActivate: [guestOnlyWithJourneyGuard],
    title: 'Sign In',
    loadComponent: () =>
      import('./features/auth/sign-in.component').then((m) => m.SignInComponent),
  },
  { path: 'login', redirectTo: 'sign-in', pathMatch: 'full' },

  {
    path: 'onboarding/complete-profile',
    canActivate: [customerSignedInGuard, profileOnboardingGuard],
    title: 'Complete Profile',
    loadComponent: () =>
      import('./features/onboarding/complete-profile.component').then(
        (m) => m.CompleteProfileComponent,
      ),
  },

  {
    path: 'onboarding/choose-suite-plan',
    canActivate: [customerSignedInGuard, suitePlanOnboardingGuard],
    title: 'Choose Suite Plan',
    loadComponent: () =>
      import('./features/onboarding/onboarding-suite-plan.component').then(
        (m) => m.OnboardingSuitePlanComponent,
      ),
  },

  {
    path: 'session-expired',
    title: 'Session ended',
    data: { continueTo: '/sign-in' },
    loadComponent: () =>
      import('@wayel/shared/components/session-expired.component').then(
        (m) => m.SessionExpiredComponent,
      ),
  },

  {
    path: 'suite-access/checkout',
    canActivate: [customerSignedInGuard, profileCompleteGuard],
    title: 'Activate Suite Access',
    loadComponent: () =>
      import('./features/suite/suite-checkout.component').then(
        (m) => m.SuiteCheckoutComponent,
      ),
  },

  {
    path: '',
    canActivate: [portalReadyGuard],
    loadComponent: () =>
      import('./features/layout/portal-shell.component').then(
        (m) => m.PortalShellComponent,
      ),
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'my-address',
        title: 'My Address & Profile',
        loadComponent: () =>
          import('./features/address/my-address.component').then(
            (m) => m.MyAddressComponent,
          ),
      },
      { path: 'my-profile', redirectTo: 'my-address', pathMatch: 'full' },
      {
        path: 'received-parcels',
        title: 'Received Parcels',
        loadComponent: () =>
          import('./features/parcels/received-parcels.component').then(
            (m) => m.ReceivedParcelsComponent,
          ),
      },
      {
        path: 'parcels/:id',
        title: 'Parcel Details',
        loadComponent: () =>
          import('./features/parcels/parcel-details.component').then(
            (m) => m.ParcelDetailsComponent,
          ),
      },
      {
        path: 'shipments/create',
        title: 'Create Shipment',
        loadComponent: () =>
          import('./features/shipments/create-shipment.component').then(
            (m) => m.CreateShipmentComponent,
          ),
      },
      {
        path: 'shipping/quote/:id',
        title: 'Shipping Quote',
        loadComponent: () =>
          import('./features/quotes/shipping-quote.component').then(
            (m) => m.ShippingQuoteComponent,
          ),
      },
      {
        path: 'tracking-support',
        title: 'Tracking & Support',
        loadComponent: () =>
          import('./features/tracking/tracking-support.component').then(
            (m) => m.TrackingSupportComponent,
          ),
      },
    ],
  },

  {
    path: 'not-found',
    title: 'Page not found',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
  { path: '**', redirectTo: 'not-found' },
];
