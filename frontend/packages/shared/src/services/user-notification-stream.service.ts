import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Observable, share } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type { UserNotificationKind } from './user-notifications-api.service';

/**
 * Wire shape of a `notification` event delivered over the
 * `GET /api/v1/me/notifications/stream` SSE endpoint. Mirrors the
 * server-side `UserNotificationStreamEvent` record exactly.
 *
 * The DTO is intentionally a subset of `UserNotificationDto` — it
 * carries everything the bell needs to render an inline preview row
 * without an extra round-trip, but no read-state (a freshly broadcast
 * row is unread by definition) and no `subscriptionRequestId` (the
 * deep-link path is what the SPA actually navigates to).
 */
export interface UserNotificationStreamEventDto {
  id: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  actionPath: string | null;
  createdOnUtc: string;
}

/**
 * Live push channel for the in-app notification bell. Wraps the
 * browser's native `EventSource` against
 * `GET /api/v1/me/notifications/stream`.
 *
 * <p>
 * Design notes:
 * <ul>
 *   <li><b>Reference-counted lifecycle.</b> The underlying
 *       <code>EventSource</code> is opened on the first subscriber and
 *       closed when the last subscriber unsubscribes — multiple
 *       consumers (bell badge, history page, toaster) share one
 *       socket. This is the <code>share()</code> operator with
 *       <code>resetOnRefCountZero</code>.</li>
 *   <li><b>Auth.</b> <code>EventSource</code> can't set custom headers,
 *       so we rely entirely on cookies. We pass
 *       <code>{ withCredentials: true }</code> so the BFF cookies ride
 *       along; the BFF then injects the bearer token before YARP
 *       forwards to the API. No SPA-side token plumbing is needed.</li>
 *   <li><b>Reconnect.</b> Built into <code>EventSource</code> (~3s
 *       exponential backoff). When the SPA reconnects, the consumer
 *       should run a fresh inbox refresh — the stream doesn't replay
 *       events fired during the gap (see
 *       <code>InMemoryNotificationStreamBroker</code>).</li>
 *   <li><b>Errors.</b> A failing SSE connection is non-fatal — the
 *       polling baseline (60s interval + manual nudges) still updates
 *       the bell. We surface errors via the observable's <code>error</code>
 *       channel so callers can <code>catchError</code> and fall back
 *       cleanly.</li>
 * </ul>
 * </p>
 *
 * Usage:
 * <pre>
 *   this.stream.notifications$.subscribe(ev =&gt; this.refreshNudge$.next());
 * </pre>
 */
@Injectable({ providedIn: 'root' })
export class UserNotificationStreamService {
  private readonly apiUrl = inject(PLATFORM_API_URL);
  private readonly document = inject(DOCUMENT);

  /**
   * Multicast push channel. Each emission represents a *new* in-app
   * notification row for the signed-in user.
   *
   * The observable is cold-on-the-outside (subscribe to start) but
   * shared internally — we only ever hold one open
   * <code>EventSource</code> regardless of how many consumers attach.
   */
  readonly notifications$: Observable<UserNotificationStreamEventDto> = new Observable<UserNotificationStreamEventDto>(
    (subscriber) => {
      const url = `${this.apiUrl ?? ''}/api/v1/me/notifications/stream`;

      const win = this.document.defaultView;
      if (!win || typeof win.EventSource !== 'function') {
        // Server-side render or ancient browser — surface "complete"
        // immediately so callers don't wait forever. The polling
        // baseline still drives the bell.
        subscriber.complete();
        return undefined;
      }

      // `withCredentials: true` is what makes the BFF cookies ride
      // along on the streaming GET. Without it, EventSource omits
      // cookies and the API returns 401.
      const source = new win.EventSource(url, { withCredentials: true });

      const onNotification = (raw: MessageEvent) => {
        try {
          const parsed = JSON.parse(raw.data) as UserNotificationStreamEventDto;
          subscriber.next(parsed);
        } catch (err) {
          // Bad payload is non-fatal — log and skip; the next event
          // will likely parse fine, and the bell still polls. We never
          // tear the connection down on a single decode error.
          // eslint-disable-next-line no-console
          console.warn('[notification-stream] dropped malformed event', err);
        }
      };

      const onError = (err: Event) => {
        // EventSource auto-reconnects on transient network blips, so a
        // single error event is *not* a teardown signal — only escalate
        // to the subscriber when the connection is permanently closed
        // (readyState === CLOSED), which happens e.g. on 401 after the
        // session expires.
        if (source.readyState === win.EventSource.CLOSED) {
          subscriber.error(err);
        }
      };

      source.addEventListener('notification', onNotification as EventListener);
      source.addEventListener('error', onError);

      return () => {
        source.removeEventListener('notification', onNotification as EventListener);
        source.removeEventListener('error', onError);
        source.close();
      };
    },
  ).pipe(share({ resetOnRefCountZero: true }));
}
