import { Injectable } from '@angular/core';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { BarcodeScanService } from './barcode-scan.service';

/** Fields read from a label image — the image itself is never persisted. */
export interface ShippingLabelExtraction {
  trackingNumber: string | null;
  courier: string | null;
  retailer: string | null;
  suiteNumber: string | null;
  confidence: 'high' | 'partial' | 'low';
  trackingSource: 'barcode' | 'ocr' | null;
  fieldsFound: string[];
}

const RETAILER_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'Amazon US', re: /\bamazon(?:\.com)?\b/i },
  { id: 'Walmart', re: /\bwalmart\b/i },
  { id: 'eBay', re: /\bebay\b/i },
  { id: 'Takealot', re: /\btakealot\b/i },
];

const COURIER_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'UPS', re: /\bups\b|\bunited\s+parcel\b/i },
  { id: 'FedEx', re: /\bfedex\b|\bfederal\s+express\b/i },
  { id: 'USPS', re: /\busps\b|\bu\.?s\.?\s*postal\b|\bpostal\s+service\b/i },
  { id: 'DHL', re: /\bdhl\b/i },
];

const LABELED_TRACKING =
  /(?:tracking\s*(?:number|#|no\.?)?|track\s*(?:#|ing)?|trk\s*#?|waybill\s*#?|consignment\s*#?|reference\s*#?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{7,33})/gi;

const TRACKING_CANDIDATE =
  /\b(1Z[0-9A-Z]{16}|TBA[A-Z0-9]{10,}|9[2345]\d{18,20}|\d{12,22}|JD[A-Z0-9]{10,}|JJD[A-Z0-9]{10,}|GM[A-Z0-9]{10,})\b/gi;

@Injectable({ providedIn: 'root' })
export class ShippingLabelExtractService {
  private workerReady: Promise<Worker> | null = null;

  constructor(private readonly barcode: BarcodeScanService) {}

  /** Reads only the parcel fields needed from a transient image blob. */
  async extractFromImage(file: File | Blob): Promise<ShippingLabelExtraction> {
    const prepared = await this.prepareImage(file);
    const fileForBarcode =
      prepared instanceof File
        ? prepared
        : new File([prepared], 'label.jpg', { type: 'image/jpeg' });

    const [barcodeHit, ocrText] = await Promise.all([
      this.barcode.decodeFromImageFile(fileForBarcode).catch(() => null),
      this.runOcr(prepared).catch(() => ''),
    ]);

    const normalizedOcr = ocrText.replace(/\r/g, '\n');
    let tracking = barcodeHit?.text ?? null;
    let trackingSource: ShippingLabelExtraction['trackingSource'] = tracking ? 'barcode' : null;

    if (!tracking) {
      tracking = this.pickBestTracking(normalizedOcr);
      if (tracking) trackingSource = 'ocr';
    }

    const courier =
      (tracking ? this.barcode.guessCourier(tracking) : null) ??
      this.matchFromPatterns(normalizedOcr, COURIER_PATTERNS);
    const retailer = this.matchFromPatterns(normalizedOcr, RETAILER_PATTERNS);
    const suiteNumber = this.extractSuiteNumber(normalizedOcr);

    const fieldsFound = [
      tracking ? 'tracking' : null,
      courier ? 'courier' : null,
      retailer ? 'retailer' : null,
      suiteNumber ? 'suite' : null,
    ].filter((f): f is string => !!f);

    const confidence: ShippingLabelExtraction['confidence'] =
      tracking && fieldsFound.length >= 2
        ? 'high'
        : tracking || fieldsFound.length >= 2
          ? 'partial'
          : fieldsFound.length > 0
            ? 'partial'
            : 'low';

    return {
      trackingNumber: tracking,
      courier,
      retailer,
      suiteNumber,
      confidence,
      trackingSource,
      fieldsFound,
    };
  }

  private async getWorker(): Promise<Worker> {
    if (!this.workerReady) {
      this.workerReady = (async () => {
        const w = await createWorker('eng');
        await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        return w;
      })();
    }
    return this.workerReady;
  }

  private async runOcr(file: File | Blob): Promise<string> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(file);
    return data.text ?? '';
  }

  private async prepareImage(file: File | Blob): Promise<File | Blob> {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const maxSide = 1800;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const w = Math.round(bitmap.width * scale);
        const h = Math.round(bitmap.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
        );
        return blob ?? file;
      } finally {
        bitmap.close();
      }
    } catch {
      return file;
    }
  }

  private pickBestTracking(text: string): string | null {
    const flat = text.replace(/\s+/g, ' ');
    const candidates: string[] = [];

    let labeled: RegExpExecArray | null;
    const labeledRe = new RegExp(LABELED_TRACKING.source, LABELED_TRACKING.flags);
    while ((labeled = labeledRe.exec(flat)) !== null) {
      const norm = this.barcode.normalizeTracking(labeled[1].replace(/-/g, ''));
      if (norm.length >= 8) candidates.push(norm);
    }

    let m: RegExpExecArray | null;
    const re = new RegExp(TRACKING_CANDIDATE.source, TRACKING_CANDIDATE.flags);
    while ((m = re.exec(flat)) !== null) {
      const norm = this.barcode.normalizeTracking(m[1]);
      if (norm.length >= 8) candidates.push(norm);
    }

    if (candidates.length === 0) return null;
    const unique = [...new Set(candidates)];
    unique.sort((a, b) => scoreTracking(b) - scoreTracking(a));
    return unique[0] ?? null;
  }

  private extractSuiteNumber(text: string): string | null {
    const patterns = [
      /\bsuite\s*#?\s*(\d{2,5})\b/i,
      /\bste\.?\s*#?\s*(\d{2,5})\b/i,
      /\bborder\s*box\s*#?\s*(\d{2,5})\b/i,
      /\bweyell\s*#?\s*(\d{2,5})\b/i,
      /\bfelidaen\s*#?\s*(\d{2,5})\b/i,
      /\b(?:suite|ste)\s*:\s*(\d{2,5})\b/i,
      /\b#\s*(\d{3,5})\b(?=.*(?:suite|ste|border|weyell))/i,
    ];
    for (const re of patterns) {
      const hit = text.match(re);
      if (hit?.[1]) return hit[1];
    }
    return null;
  }

  private matchFromPatterns(
    text: string,
    patterns: { id: string; re: RegExp }[],
  ): string | null {
    for (const { id, re } of patterns) {
      if (re.test(text)) return id;
    }
    return null;
  }
}

function scoreTracking(t: string): number {
  if (/^1Z/i.test(t)) return 100;
  if (/^TBA/i.test(t)) return 90;
  if (/^9[2345]\d{18}$/.test(t)) return 85;
  if (/^\d{12,22}$/.test(t)) return 70;
  return t.length;
}
