import { Injectable } from '@angular/core';

export interface PaystackCheckoutInit {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amountZar: number;
  provider: string;
  publicKey: string | null;
}

/**
 * Outcome of an inline Paystack payment attempt. The component uses this to
 * decide whether to navigate to the checkout-complete page, surface an error
 * inline, or just clear the busy state (cancellation).
 */
export type PaystackCheckoutOutcome =
  | { status: 'success'; reference: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

interface PaystackPopOptions {
  onSuccess?: (transaction: { reference?: string; trxref?: string } & Record<string, unknown>) => void;
  onCancel?: () => void;
  onLoad?: (response: unknown) => void;
  onError?: (error: { message?: string } & Record<string, unknown>) => void;
}

interface PaystackPopInstance {
  resumeTransaction(accessCode: string, options?: PaystackPopOptions): void;
}

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopInstance;
  }
}

let scriptLoad: Promise<void> | null = null;

@Injectable({ providedIn: 'root' })
export class PaystackCheckoutService {
  /**
   * Opens Paystack's inline popup for the supplied transaction. Resolves
   * with a structured outcome so callers can drive navigation/UX without
   * having to reach into the global Paystack SDK themselves.
   *
   * If the inline SDK can't be loaded (offline / blocked) we fall back to a
   * full-page redirect to the hosted authorisation URL; in that case the
   * promise never resolves because the browser navigates away.
   */
  async start(init: PaystackCheckoutInit): Promise<PaystackCheckoutOutcome> {
    try {
      await this.ensureScript();
    } catch {
      window.location.href = init.authorizationUrl;
      // Fall through with a "cancelled" so callers clear the busy flag if
      // the navigation is somehow blocked (e.g. popup blockers / extensions).
      return { status: 'cancelled' };
    }

    if (!window.PaystackPop) {
      window.location.href = init.authorizationUrl;
      return { status: 'cancelled' };
    }

    return new Promise<PaystackCheckoutOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: PaystackCheckoutOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      try {
        const popup = new window.PaystackPop!();
        popup.resumeTransaction(init.accessCode, {
          onSuccess: (tx) => {
            const reference =
              (typeof tx?.reference === 'string' && tx.reference) ||
              (typeof tx?.trxref === 'string' && tx.trxref) ||
              init.reference;
            settle({ status: 'success', reference });
          },
          onCancel: () => settle({ status: 'cancelled' }),
          onError: (err) =>
            settle({
              status: 'error',
              message:
                (typeof err?.message === 'string' && err.message) ||
                'Paystack reported an error processing the payment.',
            }),
        });
      } catch {
        window.location.href = init.authorizationUrl;
        settle({ status: 'cancelled' });
      }
    });
  }

  private ensureScript(): Promise<void> {
    if (window.PaystackPop) {
      return Promise.resolve();
    }
    if (!scriptLoad) {
      scriptLoad = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-paystack-inline]');
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('Could not load Paystack.')));
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://js.paystack.co/v2/inline.js';
        script.async = true;
        script.dataset['paystackInline'] = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Could not load Paystack.'));
        document.body.appendChild(script);
      });
    }
    return scriptLoad;
  }
}
