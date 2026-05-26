import { TestBed } from '@angular/core/testing';
import {
  PaystackCheckoutService,
  type PaystackCheckoutInit,
} from './paystack-checkout.service';

interface PaystackPopOptions {
  onSuccess?: (tx: Record<string, unknown>) => void;
  onCancel?: () => void;
  onError?: (err: Record<string, unknown>) => void;
}

class FakePaystackPop {
  constructor() {}

  resumeTransaction(_accessCode: string, options: PaystackPopOptions): void {
    FakePaystackPop.lastOptions = options;
    FakePaystackPop.optionsReadyResolve?.(options);
  }

  static lastOptions: PaystackPopOptions | null = null;
  static optionsReady: Promise<PaystackPopOptions> = Promise.resolve(null as never);
  static optionsReadyResolve: ((options: PaystackPopOptions) => void) | null = null;

  static reset(): void {
    FakePaystackPop.lastOptions = null;
    FakePaystackPop.optionsReady = new Promise<PaystackPopOptions>((resolve) => {
      FakePaystackPop.optionsReadyResolve = resolve;
    });
  }
}

function makeInit(overrides: Partial<PaystackCheckoutInit> = {}): PaystackCheckoutInit {
  return {
    reference: 'init-ref',
    authorizationUrl: 'https://paystack.example.test/redirect',
    accessCode: 'access-code',
    amountZar: 1234,
    provider: 'paystack',
    publicKey: 'pk_test_xxx',
    ...overrides,
  };
}

describe('PaystackCheckoutService', () => {
  let service: PaystackCheckoutService;
  let originalPop: typeof window.PaystackPop;
  let navigateSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PaystackCheckoutService] });
    service = TestBed.inject(PaystackCheckoutService);

    FakePaystackPop.reset();
    originalPop = window.PaystackPop;
    window.PaystackPop = FakePaystackPop as unknown as typeof window.PaystackPop;

    // Replace the navigation seam so we can assert against it without
    // actually rerouting the Karma iframe.
    navigateSpy = spyOn<any>(service, 'navigateTo').and.stub();
    // Skip the real CDN fetch in `ensureScript` so the popup ctor is reached
    // immediately and our PaystackPop fake is invoked.
    spyOn<any>(service as any, 'ensureScript').and.returnValue(Promise.resolve());
  });

  afterEach(() => {
    window.PaystackPop = originalPop;
  });

  it('resolves with success and the transaction reference from onSuccess', async () => {
    const promise = service.start(makeInit());
    const opts = await FakePaystackPop.optionsReady;
    opts.onSuccess!({ reference: 'tx-ref-123' });
    await expectAsync(promise).toBeResolvedTo({ status: 'success', reference: 'tx-ref-123' });
  });

  it('prefers tx.reference then tx.trxref then init.reference', async () => {
    const promise = service.start(makeInit({ reference: 'init-ref' }));
    (await FakePaystackPop.optionsReady).onSuccess!({ trxref: 'trxref-9' });
    await expectAsync(promise).toBeResolvedTo({ status: 'success', reference: 'trxref-9' });

    FakePaystackPop.reset();
    const promise2 = service.start(makeInit({ reference: 'fallback-ref' }));
    (await FakePaystackPop.optionsReady).onSuccess!({});
    await expectAsync(promise2).toBeResolvedTo({ status: 'success', reference: 'fallback-ref' });
  });

  it('resolves with cancelled when onCancel fires', async () => {
    const promise = service.start(makeInit());
    (await FakePaystackPop.optionsReady).onCancel!();
    await expectAsync(promise).toBeResolvedTo({ status: 'cancelled' });
  });

  it('resolves with error and forwards the SDK message', async () => {
    const promise = service.start(makeInit());
    (await FakePaystackPop.optionsReady).onError!({ message: 'card declined' });
    await expectAsync(promise).toBeResolvedTo({
      status: 'error',
      message: 'card declined',
    });
  });

  it('provides a fallback error message when the SDK omits one', async () => {
    const promise = service.start(makeInit());
    (await FakePaystackPop.optionsReady).onError!({});
    const outcome = await promise;
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.message).toContain('Paystack');
    }
  });

  it('ignores callbacks after the promise has settled', async () => {
    const promise = service.start(makeInit());
    const opts = await FakePaystackPop.optionsReady;
    opts.onSuccess!({ reference: 'first' });
    opts.onCancel!();
    opts.onError!({ message: 'late' });
    await expectAsync(promise).toBeResolvedTo({ status: 'success', reference: 'first' });
  });

  it('falls back to the authorization URL when PaystackPop is unavailable', async () => {
    window.PaystackPop = undefined;
    const init = makeInit({ authorizationUrl: 'https://paystack.example.test/redirect/abc' });
    const outcome = await service.start(init);
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(navigateSpy).toHaveBeenCalledOnceWith(init.authorizationUrl);
  });

  it('falls back to the authorization URL when constructing the popup throws', async () => {
    window.PaystackPop = class {
      constructor() {
        throw new Error('blocked by extension');
      }
      resumeTransaction(): void {}
    } as unknown as typeof window.PaystackPop;

    const init = makeInit({ authorizationUrl: 'https://paystack.example.test/redirect/def' });
    const outcome = await service.start(init);
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(navigateSpy).toHaveBeenCalledOnceWith(init.authorizationUrl);
  });
});
