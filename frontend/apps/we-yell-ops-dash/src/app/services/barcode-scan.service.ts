import { Injectable } from '@angular/core';
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

export interface BarcodeScanResult {
  text: string;
  courier: string | null;
}

@Injectable({ providedIn: 'root' })
export class BarcodeScanService {
  private readonly hints = new Map([
    [DecodeHintType.TRY_HARDER, true],
  ]);

  guessCourier(tracking: string): string | null {
    const t = tracking.trim().toUpperCase().replace(/\s/g, '');
    if (!t) return null;
    if (/^1Z[0-9A-Z]{16}$/i.test(t) || t.startsWith('1Z')) return 'UPS';
    if (/^TBA/i.test(t)) return 'Other';
    if (/^(94|93|92|95)\d{20}$/.test(t) || /^\d{22}$/.test(t)) return 'USPS';
    if (/^\d{12,15}$/.test(t) && !t.startsWith('1Z')) return 'FedEx';
    if (/^(JD|JJD|GM|LX|RX|3S)/i.test(t)) return 'DHL';
    if (/^\d{10,11}$/.test(t)) return 'DHL';
    return null;
  }

  normalizeTracking(raw: string): string {
    return raw.trim().replace(/\s+/g, '').toUpperCase();
  }

  async decodeFromImageFile(file: File): Promise<BarcodeScanResult | null> {
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader(this.hints);
      const result = await reader.decodeFromImageUrl(url);
      const text = this.normalizeTracking(result.getText());
      return text ? { text, courier: this.guessCourier(text) } : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async startCameraScan(
    video: HTMLVideoElement,
    onDecode: (result: BarcodeScanResult) => void,
    onError?: (message: string) => void,
  ): Promise<IScannerControls> {
    const reader = new BrowserMultiFormatReader(this.hints);
    try {
      return await reader.decodeFromVideoDevice(
        undefined,
        video,
        (result, err) => {
          if (result) {
            const text = this.normalizeTracking(result.getText());
            if (text) {
              onDecode({ text, courier: this.guessCourier(text) });
            }
          }
          if (err && err.name !== 'NotFoundException') {
            onError?.('Could not read barcode — adjust lighting and distance.');
          }
        },
      );
    } catch (e) {
      const msg =
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access or use manual entry.'
          : 'Could not start camera. Try manual entry or upload a label photo.';
      throw new Error(msg);
    }
  }
}
