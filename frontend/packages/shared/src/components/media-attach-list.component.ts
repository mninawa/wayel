import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  WayelAdminMediaService,
  type WayelMediaAsset,
  type WayelMediaAssetOwnerType,
  type WayelMediaKind,
} from '../services/wayel-admin-media.service';

/**
 * Generic file/image attachment widget backed by the
 * `MediaAsset` catalog endpoints (`/api/v1/media/assets`).
 *
 * <h4>What it does</h4>
 *
 * Given an `(ownerType, ownerId)` pair (Tenant / Child / Parent) it
 * lists every catalogued media asset for that owner inside the
 * caller's tenant, lets the user pick a file to upload (one-shot via
 * {@link WayelAdminMediaService.uploadAndAttach}), renders thumbnails
 * for images and labelled icons for documents / videos / audio, and
 * provides a per-row soft-delete button.
 *
 * <h4>What it deliberately does NOT do</h4>
 *
 *   - Aggregates that already store media inline (DailyReport,
 *     Memory) keep doing that — they don't go through this widget.
 *   - No drag-and-drop yet; the file input is a plain
 *     <code>&lt;input type=&quot;file&quot;&gt;</code> for accessibility +
 *     simplicity. Drop support is a future hardening.
 *   - No preview lightbox; clicking an asset opens its `mediaUrl` in
 *     a new tab (browser handles preview / download).
 *
 * <h4>Inputs</h4>
 *
 *   - <code>ownerType</code> + <code>ownerId</code> — the catalog
 *     fence. Required; nothing renders until both are present.
 *   - <code>tenantId</code> — optional SuperAdmin override forwarded
 *     to the BFF. Tenant-scoped users leave it null.
 *   - <code>scope</code> — defaults to <code>"documents"</code>.
 *     Override to <code>"branding"</code> / <code>"avatars"</code>
 *     etc. when the widget is reused on those surfaces.
 *   - <code>title</code> — section heading rendered above the list.
 *   - <code>kindFilter</code> — when set, only catalog rows of that
 *     kind (Image / Document / Video / Audio) are shown.
 *   - <code>accept</code> — optional <code>accept=</code> attribute
 *     for the file input. Defaults to a permissive value derived
 *     from the scope; pass an explicit string to lock it down.
 *   - <code>readonly</code> — hides the upload + delete affordances
 *     for screens that should display assets but not mutate them.
 */
@Component({
  selector: 'nk-media-attach-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mal" aria-labelledby="mal-title">
      <header class="mal-head">
        <div>
          <h3 id="mal-title" class="mal-title">{{ title() }}</h3>
          <p class="mal-sub">{{ subtitle() }}</p>
        </div>
        @if (!readonly()) {
          <label class="mal-upload" [class.disabled]="uploading()">
            <input
              type="file"
              [accept]="acceptAttr()"
              [disabled]="uploading()"
              (change)="onFilePicked($event)"
              hidden
            />
            <span class="mal-upload-icon" aria-hidden="true">+</span>
            <span>{{ uploading() ? 'Uploading…' : 'Upload' }}</span>
          </label>
        }
      </header>

      @if (errorMessage(); as err) {
        <p class="mal-error" role="alert">{{ err }}</p>
      }

      @if (loading()) {
        <p class="mal-muted">Loading attachments…</p>
      } @else if (rows().length === 0) {
        <p class="mal-empty">{{ emptyText() }}</p>
      } @else {
        <ul class="mal-list" role="list">
          @for (row of rows(); track row.id) {
            <li class="mal-item" role="listitem">
              <a
                class="mal-thumb"
                [href]="row.mediaUrl"
                target="_blank"
                rel="noopener"
                [title]="row.fileName ?? row.title ?? row.mediaUrl"
              >
                @if (row.kind === 'Image') {
                  <img
                    [src]="row.mediaUrl"
                    [alt]="row.fileName ?? row.title ?? 'Attachment'"
                    loading="lazy"
                    decoding="async"
                  />
                } @else {
                  <span class="mal-thumb-glyph" aria-hidden="true">
                    {{ kindGlyph(row.kind) }}
                  </span>
                }
              </a>

              <div class="mal-meta">
                <span class="mal-name">
                  {{ row.title ?? row.fileName ?? '(untitled)' }}
                </span>
                <span class="mal-sub-meta">
                  {{ kindLabel(row.kind) }}
                  @if (row.sizeBytes) {
                    · {{ formatSize(row.sizeBytes) }}
                  }
                  · {{ formatDate(row.uploadedOnUtc) }}
                </span>
              </div>

              @if (!readonly()) {
                <button
                  type="button"
                  class="mal-remove"
                  (click)="onRemove(row)"
                  [disabled]="pendingRemovals().has(row.id)"
                  [attr.aria-label]="'Remove ' + (row.fileName ?? 'attachment')"
                >
                  ×
                </button>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    :host { display: block; }
    .mal {
      display: flex; flex-direction: column; gap: 0.75rem;
      padding: 0.75rem; border: 1px solid var(--nk-surface-border, #e5e7eb);
      border-radius: 12px; background: var(--nk-surface, #fff);
    }
    .mal-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 1rem;
    }
    .mal-title {
      margin: 0; font-size: 0.95rem; font-weight: 700; color: #111827;
    }
    .mal-sub {
      margin: 0.15rem 0 0; font-size: 0.78rem; color: #6b7280;
    }
    .mal-upload {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.4rem 0.75rem; border-radius: 999px;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: #fff; font-size: 0.82rem; font-weight: 600;
      cursor: pointer; user-select: none;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.18);
    }
    .mal-upload.disabled { opacity: 0.6; cursor: progress; }
    .mal-upload-icon {
      font-size: 1.1rem; line-height: 0; font-weight: 800;
    }
    .mal-error {
      margin: 0; padding: 0.5rem 0.75rem; border-radius: 8px;
      background: #fef2f2; color: #b91c1c; font-size: 0.82rem;
    }
    .mal-muted, .mal-empty {
      margin: 0.25rem 0; color: #6b7280; font-size: 0.85rem;
    }
    .mal-list {
      list-style: none; margin: 0; padding: 0;
      display: flex; flex-direction: column; gap: 0.5rem;
    }
    .mal-item {
      display: grid; grid-template-columns: 56px 1fr auto;
      align-items: center; gap: 0.75rem;
      padding: 0.5rem; border-radius: 10px;
      background: #f9fafb;
      border: 1px solid transparent;
    }
    .mal-item:hover { border-color: #e5e7eb; background: #fff; }
    .mal-thumb {
      width: 56px; height: 56px; border-radius: 8px;
      overflow: hidden; display: grid; place-items: center;
      background: #eef2ff;
      text-decoration: none;
    }
    .mal-thumb img {
      width: 100%; height: 100%; object-fit: cover;
    }
    .mal-thumb-glyph {
      font-size: 1.4rem; color: #4338ca; font-weight: 700;
    }
    .mal-meta {
      display: flex; flex-direction: column; gap: 0.15rem;
      min-width: 0;
    }
    .mal-name {
      font-size: 0.88rem; font-weight: 600; color: #111827;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .mal-sub-meta {
      font-size: 0.74rem; color: #6b7280;
    }
    .mal-remove {
      width: 32px; height: 32px; border-radius: 8px;
      border: none; background: transparent;
      color: #b91c1c; font-size: 1.2rem; line-height: 1; cursor: pointer;
    }
    .mal-remove:hover:not(:disabled) { background: #fee2e2; }
    .mal-remove:disabled { opacity: 0.4; cursor: progress; }
  `,
})
export class MediaAttachListComponent {
  private readonly media = inject(WayelAdminMediaService);

  readonly ownerType = input.required<WayelMediaAssetOwnerType>();
  readonly ownerId = input.required<string>();
  readonly tenantId = input<string | null>(null);
  readonly scope = input<string>('documents');
  readonly title = input<string>('Attachments');
  readonly kindFilter = input<WayelMediaKind | null>(null);
  readonly accept = input<string | null>(null);
  readonly readonly = input<boolean>(false);

  /**
   * Fires after every successful list refresh (initial load AND after
   * uploads / removes settle) with the current row count. Host pages
   * use it to drive a tab-bar badge without re-querying the API.
   */
  readonly loaded = output<number>();

  protected readonly rows = signal<WayelMediaAsset[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly uploading = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pendingRemovals = signal<Set<string>>(new Set());

  protected readonly subtitle = computed(() => {
    const kind = this.kindFilter();
    if (kind) return `${this.kindLabel(kind)}s in this ${this.ownerType().toLowerCase()} folder.`;
    return `Files attached to this ${this.ownerType().toLowerCase()}.`;
  });

  protected readonly emptyText = computed(() =>
    this.readonly()
      ? 'No attachments yet.'
      : 'No attachments yet — drop a file with the Upload button.',
  );

  protected readonly acceptAttr = computed(() => {
    const explicit = this.accept();
    if (explicit) return explicit;
    const kind = this.kindFilter();
    if (kind === 'Image') return 'image/*';
    if (kind === 'Video') return 'video/*';
    if (kind === 'Audio') return 'audio/*';
    if (kind === 'Document') return 'application/pdf';
    // Documents scope (default) accepts PDFs + raster images.
    if (this.scope() === 'documents') return 'application/pdf,image/*';
    // Otherwise leave it open — server-side scope policy is the gate.
    return '';
  });

  constructor() {
    // Refetch whenever the owner changes (tab switch on the parent page,
    // route param change, etc.). The error path leaves the previous list
    // in place so a transient network blip doesn't blank the UI.
    effect(() => {
      const ownerId = this.ownerId();
      const ownerType = this.ownerType();
      if (!ownerId || !ownerType) return;
      void this.refresh();
    });
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const list = await this.media.listAssets(
        {
          ownerType: this.ownerType(),
          ownerId: this.ownerId(),
          kind: this.kindFilter(),
          scope: this.scope(),
        },
        { tenantId: this.tenantId() },
      );
      this.rows.set(list);
      this.loaded.emit(list.length);
    } catch (err) {
      this.errorMessage.set(this.errMessage(err, 'load attachments'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async onFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    this.uploading.set(true);
    this.errorMessage.set(null);
    try {
      const asset = await this.media.uploadAndAttach(
        file,
        { ownerType: this.ownerType(), ownerId: this.ownerId() },
        { tenantId: this.tenantId(), scope: this.scope() },
      );
      this.rows.update((current) => [asset, ...current]);
      this.loaded.emit(this.rows().length);
    } catch (err) {
      this.errorMessage.set(this.errMessage(err, 'upload file'));
    } finally {
      this.uploading.set(false);
      // Reset the input so picking the same file twice still triggers change.
      input.value = '';
    }
  }

  protected async onRemove(row: WayelMediaAsset): Promise<void> {
    const next = new Set(this.pendingRemovals());
    next.add(row.id);
    this.pendingRemovals.set(next);
    this.errorMessage.set(null);

    try {
      await this.media.removeAsset(row.id, { tenantId: this.tenantId() });
      this.rows.update((current) => current.filter((r) => r.id !== row.id));
      this.loaded.emit(this.rows().length);
    } catch (err) {
      this.errorMessage.set(this.errMessage(err, 'remove attachment'));
    } finally {
      const after = new Set(this.pendingRemovals());
      after.delete(row.id);
      this.pendingRemovals.set(after);
    }
  }

  protected kindGlyph(kind: WayelMediaKind): string {
    switch (kind) {
      case 'Image': return '\u{1F5BC}';
      case 'Document': return '\u{1F4C4}';
      case 'Video': return '\u{1F3AC}';
      case 'Audio': return '\u{1F3B5}';
      default: return '\u25A2';
    }
  }

  protected kindLabel(kind: WayelMediaKind): string {
    switch (kind) {
      case 'Image': return 'Image';
      case 'Document': return 'Document';
      case 'Video': return 'Video';
      case 'Audio': return 'Audio';
      default: return 'File';
    }
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  protected formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  private errMessage(err: unknown, action: string): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message?: string }).message;
      if (m) return m;
    }
    return `Could not ${action}. Please try again.`;
  }
}
