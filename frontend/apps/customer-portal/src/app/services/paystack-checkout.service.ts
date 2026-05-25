import { Injectable, signal } from '@angular/core';

export interface PaystackCheckoutInit {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amountZar: number;
  provider: string;
  publicKey: string | null;
}

interface PaystackPopInstance {
  resumeTransaction(accessCode: string): void;
}

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopInstance;
  }
}

let scriptLoad: Promise<void> | null = null;

@Injectable({ providedIn: 'root' })
export class PaystackCheckoutService {
  /** Dev-only simulated payment sheet (when API has no Paystack secret). */
  readonly simulated = signal<PaystackCheckoutInit | null>(null);

  async start(init: PaystackCheckoutInit): Promise<void> {
    if (init.accessCode === 'simulated' || !init.publicKey?.trim()) {
      this.simulated.set(init);
      return;
    }

    await this.openInline(init);
  }

  confirmSimulated(): void {
    const init = this.simulated();
    if (!init) return;
    this.simulated.set(null);
    window.location.href = init.authorizationUrl;
  }

  cancelSimulated(): void {
    this.simulated.set(null);
  }

  private async openInline(init: PaystackCheckoutInit): Promise<void> {
    await this.ensureScript();
    if (!window.PaystackPop) {
      window.location.href = init.authorizationUrl;
      return;
    }

    try {
      const popup = new window.PaystackPop();
      popup.resumeTransaction(init.accessCode);
    } catch {
      window.location.href = init.authorizationUrl;
    }
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
