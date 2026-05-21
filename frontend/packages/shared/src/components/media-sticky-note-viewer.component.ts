import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Shape of a single media asset shown by
 * {@link MediaStickyNoteViewerComponent}. Built deliberately small so
 * every existing call-site (memories, daily-report attachments, child
 * portrait, gallery tiles) can adapt their domain types in one short
 * mapper without giving up the data they want to display.
 */
export interface StickyMediaItem {
  /**
   * Stable identifier used for `track` + caption `aria-labelledby`. May
   * fall back to `url` if the caller doesn't have a server-side id yet
   * (e.g. blob: URL of a freshly picked file).
   */
  id: string;
  /** Source URL — `http(s)://`, `blob:` or `data:` are all accepted. */
  url: string;
  /**
   * What kind of element to render. When omitted we fall back to
   * `contentType` and finally to `'image'` so legacy callers Just Work.
   */
  kind?: 'image' | 'video';
  /** MIME type, e.g. `image/jpeg`, `video/mp4`. Used as a kind hint. */
  contentType?: string | null;
  /** Headline shown big in the caption strip. */
  caption?: string | null;
  /** Filename surfaced under the caption + used as Download `download=`. */
  fileName?: string | null;
  /** Optional secondary line — "Posted by Sarah · 14 Apr". */
  meta?: string | null;
  /**
   * If callers want a different URL for the Download / Open-in-new-tab
   * actions than the one rendered (e.g. a 1200-wide variant of a 640
   * thumbnail) they can set this; otherwise `url` is reused.
   */
  downloadUrl?: string | null;
}

/**
 * Family-photo / report-attachment / child-memory preview dialog skinned
 * like a sticky note pinned to the page. Replaces the four near-identical
 * dark-overlay lightboxes the app used to ship.
 *
 * Two modes:
 *   - **single**: pass `[item]`. Closing the modal clears it via
 *     `(closed)`.
 *   - **carousel**: pass `[items]` (and optionally `[startIndex]`). The
 *     component draws prev/next chevrons + "n / total" counter. The
 *     active index is internal but emitted via `(indexChange)` for
 *     callers that want to keep state in sync (e.g. for deep links).
 *
 * Either way, ESC closes, ←/→ navigate when in carousel mode, click
 * outside the sticky closes, click inside doesn't bubble. Focus is
 * trapped within the dialog while open and restored to the trigger
 * element on close so keyboard users don't get dumped at the top of
 * the page.
 *
 * Custom actions (e.g. "Print this", "Animate this", "Delete memory")
 * can be projected via `<button snAction>...</button>` slots; they
 * render before the built-in Download / Open / Close cluster.
 */
@Component({
  selector: 'nk-sticky-media-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (current(); as item) {
      <div
        class="sn-backdrop"
        role="presentation"
        (click)="onBackdropClick($event)"
      >
        @if (showNav()) {
          <button
            type="button"
            class="sn-nav prev"
            aria-label="Previous"
            (click)="previous(); $event.stopPropagation()"
          >
            <span class="material-icons-outlined" aria-hidden="true">chevron_left</span>
          </button>
        }

        <div
          class="sn-card"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="captionId"
          [style.--sn-paper]="paperColor()"
          (click)="$event.stopPropagation()"
          #card
        >
          <span class="sn-tape" aria-hidden="true"></span>
          <button
            type="button"
            class="sn-pin"
            aria-label="Close"
            (click)="close()"
            #closeBtn
          >
            <span class="material-icons-outlined" aria-hidden="true">close</span>
          </button>

          <div class="sn-inner">
            <div class="sn-media-frame">
              @if (isVideo(item)) {
                <video
                  class="sn-media sn-video"
                  #videoEl
                  [src]="item.url"
                  controls
                  playsinline
                  preload="metadata"
                  [autoplay]="autoplay()"
                ></video>
              } @else {
                <img
                  class="sn-media sn-image"
                  [src]="item.url"
                  [alt]="captionText() || ''"
                  referrerpolicy="no-referrer-when-downgrade"
                />
              }
            </div>

            <div class="sn-caption">
              <p class="sn-cap-main" [id]="captionId">
                {{ captionText() || 'Untitled' }}
              </p>
              @if (item.meta) {
                <p class="sn-cap-meta">{{ item.meta }}</p>
              }
              @if (showNav()) {
                <p class="sn-cap-counter" aria-live="polite">
                  {{ index() + 1 }} / {{ items()!.length }}
                </p>
              }
            </div>

            <div class="sn-actions" (click)="$event.stopPropagation()">
              <ng-content select="[snAction]"></ng-content>
              @if (downloadHref(); as href) {
                <a
                  class="sn-btn"
                  [href]="href"
                  [attr.download]="downloadFileName() || ''"
                  rel="noopener"
                >
                  <span class="material-icons-outlined" aria-hidden="true">download</span>
                  Download
                </a>
                <a
                  class="sn-btn"
                  [href]="href"
                  target="_blank"
                  rel="noopener"
                >
                  <span class="material-icons-outlined" aria-hidden="true">open_in_new</span>
                  Open
                </a>
              }
              <button
                type="button"
                class="sn-btn sn-btn-primary"
                (click)="close()"
              >
                <span class="material-icons-outlined" aria-hidden="true">close</span>
                Close
              </button>
            </div>
          </div>
        </div>

        @if (showNav()) {
          <button
            type="button"
            class="sn-nav next"
            aria-label="Next"
            (click)="next(); $event.stopPropagation()"
          >
            <span class="material-icons-outlined" aria-hidden="true">chevron_right</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: contents; }

    .sn-backdrop {
      position: fixed;
      inset: 0;
      z-index: 6500;
      background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 24px env(safe-area-inset-right, 16px)
              env(safe-area-inset-bottom, 16px) env(safe-area-inset-left, 16px);
      animation: sn-fade-in 160ms ease-out;
    }
    @keyframes sn-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* ─── The "sticky note" card ─────────────────────────────────────── */

    .sn-card {
      position: relative;
      max-width: min(74vw, 920px);
      max-height: min(92vh, 100%);
      padding: 26px 24px 18px;
      border-radius: 6px;
      background:
        radial-gradient(120% 120% at 0% 0%,
          rgba(255, 255, 255, 0.55), transparent 55%),
        var(--sn-paper, #fff8c4);
      box-shadow:
        0 18px 40px -12px rgba(15, 23, 42, 0.35),
        0 4px 10px rgba(15, 23, 42, 0.15),
        inset 0 0 0 1px rgba(0, 0, 0, 0.04);
      transform: rotate(-1.2deg);
      transform-origin: center top;
      animation: sn-pop 220ms cubic-bezier(.2, .9, .3, 1.4);
      color: #3b2f1f;
    }
    @keyframes sn-pop {
      from { transform: rotate(-1.2deg) scale(.92); opacity: 0; }
      to   { transform: rotate(-1.2deg) scale(1);   opacity: 1; }
    }

    /* Decorative tape strip across the top of the note. */
    .sn-tape {
      position: absolute;
      top: -14px;
      left: 50%;
      transform: translateX(-50%) rotate(-2.5deg);
      width: clamp(120px, 28%, 220px);
      height: 24px;
      background:
        linear-gradient(180deg,
          rgba(250, 250, 240, 0.65),
          rgba(250, 250, 240, 0.35));
      border-radius: 2px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
      pointer-events: none;
      backdrop-filter: blur(1px);
    }

    /* Close affordance styled as a thumb-tack in the corner. */
    .sn-pin {
      position: absolute;
      top: -14px;
      right: -14px;
      width: 38px;
      height: 38px;
      border-radius: 999px;
      border: none;
      background: #ef4444;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 4px 10px rgba(0, 0, 0, 0.25),
        inset 0 -3px 0 rgba(0, 0, 0, 0.14);
      transition: transform 120ms ease, background 120ms ease;
      z-index: 2;
    }
    .sn-pin:hover { background: #dc2626; transform: scale(1.05); }
    .sn-pin:focus-visible { outline: 3px solid #fde68a; outline-offset: 2px; }
    .sn-pin .material-icons-outlined { font-size: 20px; }

    /* Inner wrapper counter-rotates so labels + the photo stay upright
       while the outer paper is still slightly tilted. */
    .sn-inner {
      transform: rotate(1.2deg);
      transform-origin: center top;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sn-media-frame {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fbf7e6;
      border-radius: 8px;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
      padding: 6px;
      min-height: 160px;
    }

    .sn-media {
      display: block;
      max-width: 100%;
      max-height: min(65vh, 620px);
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 6px;
    }
    .sn-image {
      background: #faf5db;
    }
    .sn-video {
      background: #000;
      width: 100%;
    }

    /* ─── Caption strip ─────────────────────────────────────────────── */

    .sn-caption {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 6px;
      font-family:
        'Caveat', 'Patrick Hand', 'Kalam',
        'Comic Sans MS', cursive, system-ui;
      color: #3b2f1f;
    }
    .sn-cap-main {
      margin: 0;
      font-size: 26px;
      line-height: 1.15;
      font-weight: 700;
      letter-spacing: 0.01em;
      word-break: break-word;
    }
    .sn-cap-meta {
      margin: 0;
      font-size: 17px;
      line-height: 1.25;
      color: #6b5a3f;
      font-weight: 500;
    }
    .sn-cap-counter {
      margin: 4px 0 0;
      font-size: 14px;
      color: #8a7553;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 600;
    }

    /* ─── Actions ───────────────────────────────────────────────────── */

    .sn-actions {
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px dashed rgba(59, 47, 31, 0.18);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .sn-actions ::ng-deep [snAction] {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(59, 47, 31, 0.18);
      background: rgba(255, 255, 255, 0.55);
      color: #3b2f1f;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background 120ms ease;
    }
    .sn-actions ::ng-deep [snAction]:hover {
      background: rgba(255, 255, 255, 0.85);
    }
    .sn-actions ::ng-deep [snAction] .material-icons-outlined {
      font-size: 16px;
    }

    .sn-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid rgba(59, 47, 31, 0.18);
      background: rgba(255, 255, 255, 0.55);
      color: #3b2f1f;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background 120ms ease, transform 120ms ease;
    }
    .sn-btn:hover { background: rgba(255, 255, 255, 0.9); }
    .sn-btn:focus-visible {
      outline: 2px solid #ec4899;
      outline-offset: 2px;
    }
    .sn-btn .material-icons-outlined { font-size: 16px; }
    .sn-btn-primary {
      background: #1f2937;
      color: #fff8c4;
      border-color: #1f2937;
    }
    .sn-btn-primary:hover { background: #111827; }

    /* ─── Carousel chevrons ─────────────────────────────────────────── */

    .sn-nav {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      border: none;
      background: rgba(255, 255, 255, 0.92);
      color: #1f2937;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
      flex-shrink: 0;
      align-self: center;
    }
    .sn-nav:hover { background: #fff; }
    .sn-nav:focus-visible {
      outline: 3px solid #fde68a;
      outline-offset: 2px;
    }
    .sn-nav .material-icons-outlined { font-size: 28px; }

    /* ─── Mobile fallback ───────────────────────────────────────────── */

    @media (max-width: 520px) {
      .sn-backdrop { padding: 12px; gap: 6px; }
      .sn-card {
        max-width: 100%;
        padding: 16px 14px 12px;
        transform: none;
        animation: sn-pop-flat 200ms ease-out;
      }
      .sn-inner { transform: none; }
      .sn-cap-main { font-size: 22px; }
      .sn-cap-meta { font-size: 15px; }
      .sn-tape { display: none; }
      .sn-pin {
        top: -10px;
        right: -10px;
        width: 34px;
        height: 34px;
      }
      .sn-nav {
        width: 36px;
        height: 36px;
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
      }
      .sn-nav.prev { left: 6px; }
      .sn-nav.next { right: 6px; }
      .sn-actions {
        justify-content: stretch;
      }
      .sn-btn, .sn-actions ::ng-deep [snAction] {
        flex: 1 1 auto;
        justify-content: center;
      }
    }
    @keyframes sn-pop-flat {
      from { transform: scale(.95); opacity: 0; }
      to   { transform: scale(1);   opacity: 1; }
    }
  `,
})
export class MediaStickyNoteViewerComponent {
  /** One-shot mode — pass a single item or `null` to close. */
  readonly item = input<StickyMediaItem | null>(null);
  /** Carousel mode — pass a list to enable arrow navigation. */
  readonly items = input<StickyMediaItem[] | null>(null);
  /** Initial index when `items` is provided. */
  readonly startIndex = input<number>(0);
  /** Background paper colour — handy if a caller wants a pink/peach note. */
  readonly paperColor = input<string>('#fff8c4');
  /** Override the displayed caption (otherwise uses `item.caption`). */
  readonly caption = input<string | null>(null);
  /** When true, video items autoplay when the dialog opens. */
  readonly autoplay = input<boolean>(false);

  /** Fired whenever the user dismisses the dialog (ESC, ✕, backdrop). */
  readonly closed = output<void>();
  /** Fired whenever the active carousel index changes. */
  readonly indexChange = output<number>();

  /** Internal carousel cursor; resets when the items array identity changes. */
  protected readonly internalIndex = signal<number>(0);

  protected readonly captionId = `sn-cap-${Math.random().toString(36).slice(2, 8)}`;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    // Reset the cursor when a new gallery is handed in. Tracking
    // the array identity (not deep equality) is intentional: callers
    // mutate immutably, so a fresh array means "new lightbox session".
    effect(() => {
      const list = this.items();
      if (!list) return;
      const start = Math.max(
        0,
        Math.min(this.startIndex(), Math.max(0, list.length - 1)),
      );
      this.internalIndex.set(start);
    });

    // Capture the trigger so we can return focus there on close.
    effect(() => {
      const visible = !!this.current();
      if (visible) {
        if (typeof document !== 'undefined') {
          this.previouslyFocused =
            (document.activeElement as HTMLElement | null) ?? null;
        }
        // Defer focus to next microtask so the close button exists.
        queueMicrotask(() => {
          this.closeBtn()?.nativeElement?.focus({ preventScroll: true });
        });
      } else if (this.previouslyFocused) {
        const el = this.previouslyFocused;
        this.previouslyFocused = null;
        queueMicrotask(() => el.focus?.({ preventScroll: true }));
      }
    });
  }

  /** Convenience — the asset currently rendered in the sticky. */
  protected readonly current = computed<StickyMediaItem | null>(() => {
    const list = this.items();
    if (list && list.length > 0) {
      const i = Math.max(0, Math.min(this.internalIndex(), list.length - 1));
      return list[i] ?? null;
    }
    return this.item() ?? null;
  });

  protected readonly index = computed<number>(() => {
    const list = this.items();
    if (!list || list.length === 0) return 0;
    return Math.max(0, Math.min(this.internalIndex(), list.length - 1));
  });

  protected readonly showNav = computed<boolean>(() => {
    const list = this.items();
    return !!list && list.length > 1;
  });

  protected readonly captionText = computed<string>(() => {
    const override = this.caption();
    if (override !== null && override !== undefined) return override;
    const c = this.current();
    return c?.caption ?? c?.fileName ?? '';
  });

  protected readonly downloadHref = computed<string | null>(() => {
    const c = this.current();
    if (!c) return null;
    return c.downloadUrl ?? c.url ?? null;
  });

  protected readonly downloadFileName = computed<string | null>(() => {
    const c = this.current();
    return c?.fileName ?? null;
  });

  protected isVideo(item: StickyMediaItem): boolean {
    if (item.kind === 'video') return true;
    if (item.kind === 'image') return false;
    if (item.contentType?.toLowerCase().startsWith('video/')) return true;
    return false;
  }

  protected onBackdropClick(_event: MouseEvent): void {
    this.close();
  }

  /** Public so call-sites can drive close from outside if they want. */
  close(): void {
    this.pauseVideo();
    this.closed.emit();
  }

  next(): void {
    const list = this.items();
    if (!list || list.length < 2) return;
    const n = (this.internalIndex() + 1) % list.length;
    this.pauseVideo();
    this.internalIndex.set(n);
    this.indexChange.emit(n);
  }

  previous(): void {
    const list = this.items();
    if (!list || list.length < 2) return;
    const n = (this.internalIndex() - 1 + list.length) % list.length;
    this.pauseVideo();
    this.internalIndex.set(n);
    this.indexChange.emit(n);
  }

  private pauseVideo(): void {
    try {
      this.videoEl()?.nativeElement?.pause();
    } catch {
      /* ignore — element may not exist for image items */
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.current()) return;
    this.close();
  }

  @HostListener('document:keydown.arrowright')
  protected onArrowRight(): void {
    if (!this.current() || !this.showNav()) return;
    this.next();
  }

  @HostListener('document:keydown.arrowleft')
  protected onArrowLeft(): void {
    if (!this.current() || !this.showNav()) return;
    this.previous();
  }

  /**
   * Trap Tab focus inside the sticky while it's open. Cheap and good
   * enough for our content (a handful of focusable buttons + links).
   */
  @HostListener('document:keydown.tab', ['$event'])
  protected onTab(event: KeyboardEvent): void {
    if (!this.current()) return;
    const root = this.elementRef.nativeElement.querySelector('.sn-card');
    if (!(root instanceof HTMLElement)) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea, video[controls]',
      ),
    ).filter((el) => !el.hasAttribute('hidden'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
}
