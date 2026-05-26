import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  CustomerInAppNotificationsApiService,
  type CustomerInAppNotificationsResponse,
} from './customer-inapp-notifications-api.service';

describe('CustomerInAppNotificationsApiService', () => {
  let service: CustomerInAppNotificationsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CustomerInAppNotificationsApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CustomerInAppNotificationsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list() requests the default limit of 20 and returns the response payload', () => {
    const payload: CustomerInAppNotificationsResponse = {
      items: [
        {
          id: 'abc',
          kind: 'parcel_received',
          title: 'Parcel received',
          body: 'Suite SUI-1 — upload invoice',
          linkPath: '/parcels/1',
          createdAtUtc: '2026-01-01T00:00:00Z',
          readAtUtc: null,
        },
      ],
      unreadCount: 1,
    };

    let received: CustomerInAppNotificationsResponse | undefined;
    service.list().subscribe((res) => (received = res));

    const req = http.expectOne(
      (r) =>
        r.url === '/api/v1/borderbox/account/in-app-notifications' &&
        r.method === 'GET' &&
        r.params.get('limit') === '20',
    );
    req.flush(payload);

    expect(received).toEqual(payload);
  });

  it('list(limit) forwards the limit as a query param', () => {
    service.list(50).subscribe();
    const req = http.expectOne(
      (r) => r.url === '/api/v1/borderbox/account/in-app-notifications',
    );
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], unreadCount: 0 });
  });

  it('unreadCount() calls the dedicated endpoint and returns the count', () => {
    let received: { unreadCount: number } | undefined;
    service.unreadCount().subscribe((res) => (received = res));

    const req = http.expectOne('/api/v1/borderbox/account/in-app-notifications/unread-count');
    expect(req.request.method).toBe('GET');
    req.flush({ unreadCount: 7 });

    expect(received).toEqual({ unreadCount: 7 });
  });

  it('markRead() URL-encodes the notification id and POSTs with a null body', () => {
    service.markRead('weird id/with slashes').subscribe();
    const expectedPath =
      '/api/v1/borderbox/account/in-app-notifications/weird%20id%2Fwith%20slashes/read';
    const req = http.expectOne(expectedPath);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(null);
  });

  it('markAllRead() POSTs to /read-all with a null body', () => {
    service.markAllRead().subscribe();
    const req = http.expectOne('/api/v1/borderbox/account/in-app-notifications/read-all');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush(null);
  });
});
