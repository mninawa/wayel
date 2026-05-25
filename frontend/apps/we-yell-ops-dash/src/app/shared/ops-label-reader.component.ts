import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  ShippingLabelExtractService,
  type ShippingLabelExtraction,
} from '../services/shipping-label-extract.service';

@Component({
  selector: 'ops-label-reader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="label-reader">
      @if (reading()) {
        <div class="reading" role="status" aria-live="polite">
          <span class="material-icons-outlined spin" aria-hidden="true">document_scanner</span>
          <div>
            <strong>Reading label text…</strong>
            <span>Extracting tracking, courier, retailer, and suite. Image is not saved.</span>
          </div>
        </div>
      } @else if (cameraLive()) {
        <div class="camera">
          <video #video class="camera-video" playsinline muted autoplay></video>
          <div class="camera-actions">
            <button type="button" class="ops-btn ops-btn-primary" (click)="snapAndRead()">
              <span class="material-icons-outlined" aria-hidden="true">document_scanner</span>
              Read label
            </button>
            <button type="button" class="ops-btn ops-btn-ghost" (click)="stopCamera()">Cancel</button>
          </div>
        </div>
      } @else {
        <div class="idle">
          <button type="button" class="ops-btn ops-btn-primary" (click)="openCamera()">
            <span class="material-icons-outlined" aria-hidden="true">photo_camera</span>
            Read from camera
          </button>
          <label class="ops-btn ops-btn-outline upload-btn">
            <span class="material-icons-outlined" aria-hidden="true">upload_file</span>
            Read from photo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              (change)="onFileChosen($event)"
            />
          </label>
          @if (lastReadAt()) {
            <button type="button" class="ops-btn ops-btn-ghost" (click)="clearLastRead()">Read again</button>
          }
        </div>
        @if (lastReadAt()) {
          <p class="read-note" role="status">
            <span class="material-icons-outlined" aria-hidden="true">check_circle</span>
            Label text applied to the form below. No image was stored.
          </p>
        }
      }
      @if (error()) {
        <p class="err" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .label-reader { margin-bottom: 1rem; }
    .idle, .camera-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
    }
    .upload-btn { cursor: pointer; margin: 0; }
    .upload-btn input { display: none; }
    .camera {
      border-radius: var(--ops-radius);
      overflow: hidden;
      background: #0f172a;
    }
    .camera-video {
      width: 100%;
      max-height: 220px;
      object-fit: cover;
      display: block;
    }
    .camera-actions { padding: 0.75rem; background: #fff; border-top: 1px solid var(--ops-border); }
    .reading {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.85rem 1rem;
      border-radius: var(--ops-radius-sm);
      background: var(--ops-primary-soft);
      border: 1px solid rgba(132, 94, 194, 0.25);
      font-size: 0.82rem;
    }
    .reading strong { display: block; margin-bottom: 0.15rem; }
    .reading span { color: var(--ops-muted); line-height: 1.4; }
    .reading .material-icons-outlined { color: var(--ops-primary); font-size: 22px; }
    .read-note {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0.65rem 0 0;
      font-size: 0.82rem;
      color: #15803d;
    }
    .read-note .material-icons-outlined { font-size: 18px; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .err { margin: 0.5rem 0 0; font-size: 0.85rem; color: #b91c1c; }
  `,
})
export class OpsLabelReaderComponent implements OnDestroy {
  private readonly extract = inject(ShippingLabelExtractService);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly extracted = output<ShippingLabelExtraction>();
  readonly readError = output<string>();
  readonly readingChange = output<boolean>();

  readonly reading = signal(false);
  readonly cameraLive = signal(false);
  readonly error = signal<string | null>(null);
  readonly lastReadAt = signal<number | null>(null);

  private stream: MediaStream | null = null;

  ngOnDestroy(): void {
    this.stopCamera();
  }

  clearLastRead(): void {
    this.lastReadAt.set(null);
    this.error.set(null);
  }

  async openCamera(): Promise<void> {
    this.error.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      this.cameraLive.set(true);
      queueMicrotask(() => {
        const video = this.videoRef()?.nativeElement;
        if (video && this.stream) {
          video.srcObject = this.stream;
          void video.play();
        }
      });
    } catch {
      const msg = 'Camera unavailable. Use “Read from photo” instead.';
      this.error.set(msg);
      this.readError.emit(msg);
    }
  }

  stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.cameraLive.set(false);
    const video = this.videoRef()?.nativeElement;
    if (video) video.srcObject = null;
  }

  snapAndRead(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        this.stopCamera();
        if (blob) void this.readBlob(blob);
      },
      'image/jpeg',
      0.9,
    );
  }

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      const msg = 'Photo must be 10MB or smaller.';
      this.error.set(msg);
      this.readError.emit(msg);
      return;
    }
    void this.readBlob(file);
  }

  private async readBlob(blob: Blob): Promise<void> {
    this.reading.set(true);
    this.readingChange.emit(true);
    this.error.set(null);
    try {
      const result = await this.extract.extractFromImage(blob);
      this.lastReadAt.set(Date.now());
      this.extracted.emit(result);
    } catch {
      const msg = 'Could not read text from this label. Try a clearer photo or enter details manually.';
      this.error.set(msg);
      this.readError.emit(msg);
    } finally {
      this.reading.set(false);
      this.readingChange.emit(false);
    }
  }
}
