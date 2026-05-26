import { Routes } from '@angular/router';
import {
  customerSignedInGuard,
  guestOnlyWithJourneyGuard,
  portalReadyGuard,
  profileCompleteGuard,
  profileOnboardingGuard,
  suitePlanOnboardingGuard,
  welcomePageGuard,
} from './guards/customer-journey.guard';
import { kycOpsReviewGuard } from './guards/kyc-ops.guard';
import { parcelOpsGuard } from './guards/parcel-ops.guard';

/**
 * WeYell customer journey:
 * 1. Sign in with Google (SSO)
 * 2. Complete profile (/onboarding/complete-profile)
 * 3. Choose suite plan + pay (/onboarding/choose-suite-plan → checkout)
 * 4. Portal (/dashboard, …)
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestOnlyWithJourneyGuard],
    title: 'WeYell — shop South Africa, ship to Eswatini',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },

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

  // Standalone (no portal shell) "I'll pay later, show me how this works"
  // landing page. Lives outside the portal-shell route group so customers
  // who haven't activated their suite don't see the dashboard sidebar with
  // links they can't yet use.
  {
    path: 'welcome',
    canActivate: [customerSignedInGuard, welcomePageGuard],
    title: 'Welcome to WeYell',
    loadComponent: () =>
      import('./features/welcome/welcome.component').then((m) => m.WelcomeComponent),
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
    path: '',
    canActivate: [customerSignedInGuard],
    loadComponent: () =>
      import('./features/layout/portal-shell.component').then(
        (m) => m.PortalShellComponent,
      ),
    children: [
      {
        path: 'suite-access/checkout',
        canActivate: [profileCompleteGuard],
        title: 'Renew Suite Access',
        loadComponent: () =>
          import('./features/suite/suite-checkout.component').then(
            (m) => m.SuiteCheckoutComponent,
          ),
      },
      {
        path: 'suite-access/checkout/complete',
        canActivate: [profileCompleteGuard],
        title: 'Payment confirmation',
        loadComponent: () =>
          import('./features/suite/suite-checkout-complete.component').then(
            (m) => m.SuiteCheckoutCompleteComponent,
          ),
      },
      {
        path: 'dashboard',
        canActivate: [portalReadyGuard],
        title: 'Dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'my-address',
        canActivate: [portalReadyGuard],
        title: 'My Address & Profile',
        loadComponent: () =>
          import('./features/address/my-address.component').then(
            (m) => m.MyAddressComponent,
          ),
      },
      { path: 'my-profile', redirectTo: 'my-address', pathMatch: 'full' },
      {
        path: 'received-parcels',
        canActivate: [portalReadyGuard],
        title: 'Received Parcels',
        loadComponent: () =>
          import('./features/parcels/received-parcels.component').then(
            (m) => m.ReceivedParcelsComponent,
          ),
      },
      {
        path: 'parcels/:id',
        canActivate: [portalReadyGuard],
        title: 'Parcel Details',
        loadComponent: () =>
          import('./features/parcels/parcel-details.component').then(
            (m) => m.ParcelDetailsComponent,
          ),
      },
      {
        path: 'quotes',
        canActivate: [portalReadyGuard],
        loadComponent: () =>
          import('./features/quotes/quotes-hub.component').then((m) => m.QuotesHubComponent),
        children: [
          {
            path: '',
            redirectTo: 'list',
            pathMatch: 'full',
          },
          {
            path: 'list',
            title: 'Your quotes',
            loadComponent: () =>
              import('./features/quotes/quotes-list.component').then(
                (m) => m.QuotesListComponent,
              ),
          },
          {
            path: 'request',
            title: 'Request quote',
            loadComponent: () =>
              import('./features/shipments/create-shipment.component').then(
                (m) => m.CreateShipmentComponent,
              ),
          },
        ],
      },
      {
        path: 'quotes/:id',
        canActivate: [portalReadyGuard],
        title: 'Quote details',
        loadComponent: () =>
          import('./features/quotes/shipping-quote.component').then(
            (m) => m.ShippingQuoteComponent,
          ),
      },
      {
        path: 'quotes/:id/checkout/complete',
        canActivate: [portalReadyGuard],
        title: 'Quote payment',
        loadComponent: () =>
          import('./features/quotes/quote-checkout-complete.component').then(
            (m) => m.QuoteCheckoutCompleteComponent,
          ),
      },
      {
        path: 'quotes/request/select-parcels',
        redirectTo: 'quotes/request',
        pathMatch: 'full',
      },
      {
        path: 'shipments/create',
        redirectTo: 'quotes/request',
        pathMatch: 'full',
      },
      {
        path: 'shipping/quote/:id',
        redirectTo: 'quotes/:id',
        pathMatch: 'full',
      },
      {
        path: 'tracking-support',
        canActivate: [portalReadyGuard],
        title: 'Support',
        loadComponent: () =>
          import('./features/tracking/tracking-support.component').then(
            (m) => m.TrackingSupportComponent,
          ),
      },
      {
        path: 'shipments/:shipmentId/track',
        canActivate: [portalReadyGuard],
        title: 'Track shipment',
        loadComponent: () =>
          import('./features/tracking/shipment-tracking.component').then(
            (m) => m.ShipmentTrackingComponent,
          ),
      },
      {
        path: 'parcels/:parcelId/track',
        canActivate: [portalReadyGuard],
        title: 'Track shipment',
        loadComponent: () =>
          import('./features/tracking/shipment-tracking.component').then(
            (m) => m.ShipmentTrackingComponent,
          ),
      },
      {
        path: 'internal/kyc-review',
        canActivate: [customerSignedInGuard, kycOpsReviewGuard],
        title: 'KYC review',
        loadComponent: () =>
          import('./features/ops/kyc-ops-review.component').then(
            (m) => m.KycOpsReviewComponent,
          ),
      },
      {
        path: 'internal/parcel-receive',
        canActivate: [customerSignedInGuard, parcelOpsGuard],
        title: 'Receive parcel',
        loadComponent: () =>
          import('./features/ops/parcel-receive.component').then(
            (m) => m.ParcelReceiveComponent,
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
