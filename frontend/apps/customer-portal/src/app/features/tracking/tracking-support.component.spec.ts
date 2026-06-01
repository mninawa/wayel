import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import {
  BorderboxApiService,
  type TrackingSupportOverviewDto,
} from '../../services/borderbox-api.service';
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
    whatsAppTestAvailable: false,
    ...overrides,
  };
}

describe('TrackingSupportComponent', () => {
  let api: jasmine.SpyObj<BorderboxApiService>;
  let fixture: ComponentFixture<TrackingSupportComponent>;
  let component: TrackingSupportComponent;

  beforeEach(() => {
    api = jasmine.createSpyObj<BorderboxApiService>('BorderboxApiService', ['getTrackingSupport']);

    TestBed.configureTestingModule({
      imports: [TrackingSupportComponent],
      providers: [provideRouter([]), { provide: BorderboxApiService, useValue: api }],
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
    expect(fixture.nativeElement.querySelector('nk-pulse-loader')).not.toBeNull();
  });

  it('renders WhatsApp and email channels when configured', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture()));
    render();

    const whatsAppLink = fixture.nativeElement.querySelector('a.contact-tile-whatsapp') as HTMLAnchorElement;
    expect(whatsAppLink.getAttribute('href')).toBe('https://wa.me/27821234567');
    expect(whatsAppLink.getAttribute('target')).toBe('_blank');
    expect(whatsAppLink.textContent).toContain('+27 82 123 4567');

    const emailLink = fixture.nativeElement.querySelector('a.contact-tile-email') as HTMLAnchorElement;
    expect(emailLink.getAttribute('href')).toBe(
      `mailto:support@weyell.test?subject=${encodeURIComponent('WeYell support')}`,
    );

    expect(fixture.nativeElement.querySelector('.ticket-card')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Notifications');
    expect(fixture.nativeElement.textContent).not.toContain('Submit ticket');
  });

  it('renders a WhatsApp Business short link when configured', () => {
    api.getTrackingSupport.and.returnValue(
      of(
        overviewFixture({
          support: {
            whatsAppLink: 'https://wa.me/message/NEGKMQLT5LJNE1',
            whatsAppDisplay: 'WeYell courier',
            emailAddress: 'support@weyell.test',
          },
        }),
      ),
    );
    render();

    const whatsAppLink = fixture.nativeElement.querySelector('a.contact-tile-whatsapp') as HTMLAnchorElement;
    expect(whatsAppLink.getAttribute('href')).toBe('https://wa.me/message/NEGKMQLT5LJNE1');
    expect(whatsAppLink.textContent).toContain('WeYell courier');
  });

  it('shows a friendly label for message links when the API returns a phone number', () => {
    api.getTrackingSupport.and.returnValue(
      of(
        overviewFixture({
          support: {
            whatsAppLink: 'https://wa.me/message/NEGKMQLT5LJNE1',
            whatsAppDisplay: '+27649611859',
            emailAddress: 'support@weyell.test',
          },
        }),
      ),
    );
    render();
    expect(fixture.nativeElement.querySelector('a.contact-tile-whatsapp')?.textContent).toContain('Chat with our team');
    expect(fixture.nativeElement.textContent).not.toContain('+27649611859');
  });

  it('falls back to a disabled WhatsApp tile when no link is configured', () => {
    api.getTrackingSupport.and.returnValue(
      of(overviewFixture({ support: { whatsAppLink: null, whatsAppDisplay: null, emailAddress: 'help@weyell.test' } })),
    );
    render();
    expect(fixture.nativeElement.querySelector('a.contact-tile-whatsapp')).toBeNull();
    expect(fixture.nativeElement.querySelector('.contact-tile-disabled')?.textContent).toContain('Not available');
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

  it('exposes a link to /shipments/:id/track when an active shipment exists', () => {
    api.getTrackingSupport.and.returnValue(of(overviewFixture({ activeShipmentId: 'ship-1' })));
    render();

    const link = fixture.nativeElement.querySelector('.shipment-card a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('/shipments/ship-1/track');
  });
});
