import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { IScannerControls } from '@zxing/browser';
import { BarcodeScanService } from '../services/barcode-scan.service';

@Component({
  selector: 'ops-barcode-scanner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scanner-wrap">
      <div class="scanner-viewport" [class.scanning]="active()">
        <video #video class="scanner-video" playsinline muted autoplay></video>
        @if (!active()) {
          <div class="scanner-placeholder">
            <span class="material-icons-outlined" aria-hidden="true">qr_code_scanner</span>
            <p>Camera preview</p>
          </div>
        }
        <div class="scanner-frame" aria-hidden="true"></div>
      </div>
      <div class="scanner-actions">
        @if (!active()) {
          <button type="button" class="ops-btn ops-btn-primary" (click)="start()">
            <span class="material-icons-outlined" aria-hidden="true">photo_camera</span>
            Start camera scan
          </button>
        } @else {
          <button type="button" class="ops-btn ops-btn-ghost" (click)="stop()">Stop camera</button>
        }
        @if (lastScan()) {
          <p class="scan-ok">
            <span class="material-icons-outlined" aria-hidden="true">check_circle</span>
            Scanned: <strong>{{ lastScan() }}</strong>
          </p>
        }
      </div>
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .scanner-wrap { margin-bottom: 1rem; }
    .scanner-viewport {
      position: relative;
      border-radius: var(--ops-radius);
      overflow: hidden;
      background: #0f172a;
      aspect-ratio: 16 / 9;
      max-height: 280px;
    }
    .scanner-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .scanner-viewport:not(.scanning) .scanner-video { opacity: 0; }
    .scanner-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      gap: 0.35rem;
    }
    .scanner-placeholder .material-icons-outlined { font-size: 2.5rem; opacity: 0.5; }
    .scanner-placeholder p { margin: 0; font-size: 0.82rem; }
    .scanner-frame {
      position: absolute;
      inset: 12% 8%;
      border: 2px solid rgba(132, 94, 194, 0.85);
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.35);
      pointer-events: none;
    }
    .scanner-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.65rem;
      margin-top: 0.75rem;
    }
    .scan-ok {
      margin: 0;
      font-size: 0.85rem;
      color: #15803d;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .scan-ok .material-icons-outlined { font-size: 18px; }
    .err { margin: 0.5rem 0 0; font-size: 0.85rem; color: #b91c1c; }
  `,
})
export class OpsBarcodeScannerComponent implements OnDestroy {
  private readonly barcode = inject(BarcodeScanService);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly autoStart = input(false);

  readonly decoded = output<{ text: string; courier: string | null }>();
  readonly scannerError = output<string>();

  readonly active = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastScan = signal<string | null>(null);

  private controls: IScannerControls | null = null;

  ngOnDestroy(): void {
    this.stop();
  }

  async start(): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    if (!video) return;
    this.error.set(null);
    try {
      this.controls = await this.barcode.startCameraScan(
        video,
        (result) => {
          this.lastScan.set(result.text);
          this.decoded.emit(result);
        },
        (msg) => this.error.set(msg),
      );
      this.active.set(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera scan failed.';
      this.error.set(msg);
      this.scannerError.emit(msg);
    }
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
    this.active.set(false);
    const video = this.videoRef()?.nativeElement;
    if (video?.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }
}
