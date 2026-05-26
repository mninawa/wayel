import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import {
  BorderboxApiService,
  type MomoMsisdnValidationDto,
  type PaymentProviderOptionDto,
} from '../../services/borderbox-api.service';
import {
  PaymentMethodPickerComponent,
  type PaymentMethodChoice,
} from './payment-method-picker.component';

function makeProviders(
  overrides: Partial<{ paystack: Partial<PaymentProviderOptionDto>; momo: Partial<PaymentProviderOptionDto> }> = {},
): PaymentProviderOptionDto[] {
  return [
    {
      provider: 'paystack',
      displayName: 'Paystack',
      isConfigured: true,
      isRecommended: true,
      ...(overrides.paystack ?? {}),
    },
    {
      provider: 'momo',
      displayName: 'MTN MoMo',
      isConfigured: true,
      isRecommended: false,
      ...(overrides.momo ?? {}),
    },
  ];
}

describe('PaymentMethodPickerComponent', () => {
  let api: jasmine.SpyObj<BorderboxApiService>;
  let fixture: ComponentFixture<PaymentMethodPickerComponent>;
  let component: PaymentMethodPickerComponent;
  let emitted: (PaymentMethodChoice | null)[];

  function setInputs(inputs: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<BorderboxApiService>('BorderboxApiService', [
      'listPaymentProviders',
      'validateMomoMsisdn',
    ]);

    TestBed.configureTestingModule({
      imports: [PaymentMethodPickerComponent],
      providers: [{ provide: BorderboxApiService, useValue: api }],
    });
  });

  function bootstrap(initialProviders: PaymentProviderOptionDto[]): void {
    api.listPaymentProviders.and.returnValue(of(initialProviders));
    fixture = TestBed.createComponent(PaymentMethodPickerComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.choiceChange.subscribe((c) => emitted.push(c));
    fixture.detectChanges(); // triggers ngOnInit + first emit
  }

  it('shows a loading skeleton while the providers request is in flight', () => {
    // Hand the component a never-emitting observable so it stays in the loading branch.
    api.listPaymentProviders.and.returnValue(new Subject<PaymentProviderOptionDto[]>().asObservable());
    fixture = TestBed.createComponent(PaymentMethodPickerComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pmp-skeleton')).not.toBeNull();
  });

  it('renders an empty state when no providers come back', () => {
    bootstrap([]);
    expect(fixture.nativeElement.querySelector('.pmp-empty')).not.toBeNull();
    expect(emitted).toEqual([null]);
  });

  it('preselects the recommended configured provider and emits a paystack choice', () => {
    bootstrap(makeProviders());
    expect(component.selectedProvider()).toBe('paystack');
    expect(emitted.at(-1)).toEqual({ provider: 'paystack' });
    expect(component.isReady()).toBeTrue();
  });

  it('falls back to the first configured provider when no recommendation is flagged', () => {
    const providers = makeProviders({
      paystack: { isRecommended: false, isConfigured: false },
      momo: { isRecommended: false, isConfigured: true },
    });
    bootstrap(providers);
    expect(component.selectedProvider()).toBe('momo');
  });

  it('marks unconfigured providers as disabled in the DOM', () => {
    const providers = makeProviders({
      momo: { isConfigured: false, isRecommended: false },
    });
    bootstrap(providers);

    const labels: NodeListOf<HTMLLabelElement> =
      fixture.nativeElement.querySelectorAll('.pmp-opt');
    const momoLabel = Array.from(labels).find((l) => l.textContent?.includes('MTN MoMo'));
    expect(momoLabel?.classList).toContain('is-disabled');
    const radio = momoLabel?.querySelector('input[type=radio]') as HTMLInputElement;
    expect(radio.disabled).toBeTrue();
  });

  it('emits null while waiting for MoMo validation and re-emits once validated', fakeAsync(() => {
    bootstrap(makeProviders());

    component.onProviderChange('momo');
    fixture.detectChanges();
    expect(component.selectedProvider()).toBe('momo');
    expect(component.isReady()).toBeFalse();
    expect(emitted.at(-1)).toBeNull();

    const validation: MomoMsisdnValidationDto = {
      isValid: true,
      msisdn: '268760000000',
      reason: null,
    };
    api.validateMomoMsisdn.and.returnValue(of(validation));

    component.onMsisdnChange('+268 76 000 0000');
    void component.validate();
    tick();
    fixture.detectChanges();

    expect(api.validateMomoMsisdn).toHaveBeenCalledWith('+268 76 000 0000');
    expect(component.momoValidated()).toBeTrue();
    expect(component.isReady()).toBeTrue();
    expect(emitted.at(-1)).toEqual({ provider: 'momo', payerMsisdn: '268760000000' });
  }));

  it('surfaces a server-side reject reason and stays not-ready', fakeAsync(() => {
    bootstrap(makeProviders());
    component.onProviderChange('momo');
    fixture.detectChanges();
    api.validateMomoMsisdn.and.returnValue(
      of<MomoMsisdnValidationDto>({
        isValid: false,
        msisdn: '268769999999',
        reason: 'This number is not registered with MoMo.',
      }),
    );

    component.onMsisdnChange('+268 76 9999 999');
    void component.validate();
    tick();
    fixture.detectChanges();

    expect(component.momoValidated()).toBeFalse();
    expect(component.momoError()).toContain('not registered');
    expect(component.isReady()).toBeFalse();
    expect(emitted.at(-1)).toBeNull();
  }));

  it('reports a connection-style error when the validation call fails', fakeAsync(() => {
    bootstrap(makeProviders());
    component.onProviderChange('momo');
    api.validateMomoMsisdn.and.returnValue(throwError(() => new Error('offline')));

    component.onMsisdnChange('+268760000000');
    void component.validate();
    tick();

    expect(component.momoValidated()).toBeFalse();
    expect(component.momoError()).toContain('could not reach MTN MoMo');
  }));

  it('validate() short-circuits to true on Paystack without hitting the API', async () => {
    bootstrap(makeProviders());
    component.onProviderChange('paystack');
    await expectAsync(component.validate()).toBeResolvedTo(true);
    expect(api.validateMomoMsisdn).not.toHaveBeenCalled();
  });

  it('refuses to submit an empty MoMo number', async () => {
    bootstrap(makeProviders());
    component.onProviderChange('momo');
    await expectAsync(component.validate()).toBeResolvedTo(false);
    expect(component.momoError()).toContain('Enter the phone number');
  });

  it('pre-fills the MoMo number from defaultMsisdn until the user types', fakeAsync(() => {
    bootstrap(makeProviders());
    setInputs({ defaultMsisdn: '+27821234567' });
    // The defaultMsisdn -> momoMsisdn copy is driven by an Angular `effect`,
    // which needs change detection (signals + flush) to actually fire.
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.momoMsisdn()).toBe('+27821234567');

    component.onMsisdnChange('manual override');
    setInputs({ defaultMsisdn: '+27999999999' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.momoMsisdn()).toBe('manual override');
  }));
});
