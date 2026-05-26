import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import {
  BorderboxApiService,
  type SupportTicketSummaryDto,
  type TrackingSupportOverviewDto,
} from '../../services/borderbox-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';
import { accountFixture } from '../../../testing/fixtures';
import { TrackingSupportComponent } from './tracking-support.component';

function overviewFixture(
  overrides: Partial<TrackingSupportOverviewDto> = {},
): TrackingSupportOverviewDto {
  return {
    activeShipmentId: null,
    recentTicket: null,
    notifications: { email: true, sms: false, whatsApp: true },
    support: {
      whatsAppLink: 'https://wa.me/27821234567',
      whatsAppDisplay: '+27 82 123 4567',
      emailAddress: 'support@weyell.test',
    },
    ...overrides,
  };
}

function ticketFixture(): SupportTicketSummaryDto {
  return {
    id: 't1',
    displayId: 'TKT-0001',
    subject: 'Delivery delay',
    snippet: 'Wondering when my parcel will arrive…',
    status: 'Open',
    createdAtUtc: '2026-01-15T08:00:00Z',
  };
}

describe('TrackingSupportComponent', () => {
  let api: jasmine.SpyObj<BorderboxApiService>;
  let accountSvc: jasmine.SpyObj<CustomerAccountService>;
  let fixture: ComponentFixture<TrackingSupportComponent>;
  let component: TrackingSupportComponent;

  beforeEach(() => {
    api = jasmine.createSpyObj<BorderboxApiService>('BorderboxApiService', [
      'getTrackingSupport',
      'createSupportTicket',
    ]);
    accountSvc = jasmine.createSpyObj<CustomerAccountService>(
      'CustomerAccountService',
      ['ensureAccountLoaded', 'saveNotifications', 'account'],
    );
    accountSvc.ensureAccountLoaded.and.returnValue(of(accountFixture()));
    (accountSvc.account as unknown as () => ReturnType<typeof accountFixture>) = () => accountFixture();

    TestBed.configureTestingModule({
      imports: [TrackingSupportComponent],
      providers: [
        provideRouter([]),
        { provide: BorderboxApiService, useValue: api },
        { provide: CustomerAccountService, useValue: accountSvc },
      ],
    });
  });

  function render(): void {
    fixture = TestBed.createComponent(TrackingSupportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('shows the loading hint while the API call is in flight', () => {
    api.getTrackingSupport.and.returnValue(new Subject<TrackingSupportOverviewDto>().asObservable());
    render();
    expect(fixture.nativeElement.querySelector('.loading')?.textContent).toContain('Loading support');
  });

  it('renders WhatsApp + email channels and the ticket form when loaded', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    render();

    const html: HTMLElement = fixture.nativeElement;
    const whatsAppLink = html.querySelector('a.channel-whatsapp') as HTMLAnchorElement;
    expect(whatsAppLink.getAttribute('href')).toBe('https://wa.me/27821234567');
    expect(whatsAppLink.getAttribute('target')).toBe('_blank');
    expect(whatsAppLink.textContent).toContain('+27 82 123 4567');

    const emailLink = html.querySelector('a.channel-email') as HTMLAnchorElement;
    expect(emailLink.getAttribute('href')).toBe(
      `mailto:support@weyell.test?subject=${encodeURIComponent('WeYell support')}`,
    );

    expect(html.querySelector('h2.bb-card-title')?.textContent).toContain('Talk to us');
    expect(html.querySelector('button.bb-btn-primary')?.textContent).toContain('Submit ticket');
  });

  it('falls back to a disabled WhatsApp tile when no link is configured', () => {
    api.getTrackingSupport.and.returnValue(
      of(overviewFixture({ support: { whatsAppLink: null, whatsAppDisplay: null, emailAddress: 'help@weyell.test' } })),
    );
    render();
    expect(fixture.nativeElement.querySelector('a.channel-whatsapp')).toBeNull();
    const disabled = fixture.nativeElement.querySelector('.channel-disabled');
    expect(disabled?.textContent).toContain('Not configured');
  });

  it('shows an error card + retry button when the overview fails to load', () => {
    api.getTrackingSupport.and.returnValue(throwError(() => new Error('500')));
    render();
    expect(fixture.nativeElement.querySelector('.err-card')).not.toBeNull();
    expect(component.loadError()).toBeTruthy();
  });

  it('reload() re-queries the API and clears the error state', () => {
    api.getTrackingSupport.and.returnValue(throwError(() => new Error('500')));
    render();
    expect(component.loadError()).toBeTruthy();

    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    component.reload();
    expect(component.overview()).not.toBeNull();
    expect(component.loadError()).toBeNull();
  });

  it('blocks ticket submission when subject or body is empty', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    render();
    component.submitTicket();
    expect(component.ticketError()).toContain('Subject and message are required');
    expect(api.createSupportTicket).not.toHaveBeenCalled();
  });

  it('submits a valid ticket, clears the form, and surfaces it on the side', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    api.createSupportTicket.and.returnValue(of(ticketFixture()));
    render();

    component.ticketSubject.set('Delivery delay');
    component.ticketBody.set('Where is my parcel?');
    component.submitTicket();

    expect(api.createSupportTicket).toHaveBeenCalledWith('Delivery delay', 'Where is my parcel?');
    expect(component.ticketSubject()).toBe('');
    expect(component.ticketBody()).toBe('');
    expect(component.ticketSuccess()).toContain('Ticket submitted');
    expect(component.overview()?.recentTicket?.displayId).toBe('TKT-0001');
  });

  it('reports a friendly error if ticket submission fails', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    api.createSupportTicket.and.returnValue(throwError(() => new Error('500')));
    render();

    component.ticketSubject.set('Subject');
    component.ticketBody.set('Message');
    component.submitTicket();

    expect(component.ticketError()).toContain('Could not submit ticket');
    expect(component.ticketSubmitting()).toBeFalse();
  });

  it('saveNotify persists the toggle through the account service and reflects locally', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    accountSvc.saveNotifications.and.returnValue(of(accountFixture()));
    render();

    const event = { target: { checked: false } } as unknown as Event;
    component.saveNotify('whatsApp', event);
    expect(accountSvc.saveNotifications).toHaveBeenCalled();
    const callPrefs = accountSvc.saveNotifications.calls.mostRecent().args[0];
    expect(callPrefs.whatsApp).toBeFalse();
    expect(component.overview()?.notifications.whatsApp).toBeFalse();
  });

  it('surfaces an error when notification persistence fails', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    accountSvc.saveNotifications.and.returnValue(throwError(() => new Error('500')));
    render();

    component.saveNotify('email', { target: { checked: false } } as unknown as Event);
    expect(component.notifyError()).toContain('Could not save');
  });

  it('exposes a link to /shipments/:id/track when an active shipment exists', () => {
    api.getTrackingSupport.and.returnValue(
      of(overviewFixture({ activeShipmentId: 'ship-1' })),
    );
    render();

    const link = fixture.nativeElement.querySelector('.active-shipment-link a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('/shipments/ship-1/track');
  });

  it('formatTicketStatus inserts spaces in camelCased statuses', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    render();
    expect(component.formatTicketStatus('InProgress')).toBe('In Progress');
    expect(component.formatTicketStatus('Open')).toBe('Open');
  });
});
