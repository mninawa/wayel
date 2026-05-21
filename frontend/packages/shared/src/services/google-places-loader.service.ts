/// <reference types="google.maps" />

import { Injectable } from '@angular/core';

/**
 * Lazy loader for the Google Maps JS API (Places library).
 *
 * The SDK ships ~150 KB minified and we don't want it in the initial
 * bundle for callers that may never open a location-picking surface.
 * This service:
 *
 *  - Injects the `<script>` tag only on first {@link load} call.
 *  - Single-flights subsequent callers — repeated loads return the
 *    same in-flight promise / cached result.
 *  - Resolves to the global `google.maps` namespace, so callers can
 *    use the typed surface (`new google.maps.places.Autocomplete(...)`).
 *  - Falls back loudly (rejected promise) when the API key is empty
 *    or the script fails to load — UI consumers translate that into
 *    a graceful "plain text input" fallback rather than a broken
 *    page.
 *
 * The class is portal-agnostic; both the REMOVED location picker
 * and any future customer-portal surface (e.g. a parent-side
 * "find a school near me") use it through the same DI singleton so
 * the SDK is loaded at most once per page.
 */
@Injectable({ providedIn: 'root' })
export class GooglePlacesLoaderService {
  /**
   * Single-flight handle for an in-progress load. Cleared on failure
   * so a transient network blip can be retried; preserved on success
   * so subsequent callers get the same (cached) namespace without
   * re-injecting the script.
   */
  private loadingPromise: Promise<typeof google> | null = null;

  /**
   * Load the Google Maps JS API and resolve with the global `google`
   * namespace. Callers should use `result.maps.places` for the
   * Places sub-API. Resolves immediately when the SDK is already on
   * the page (e.g. another component loaded it earlier).
   *
   * @param apiKey Your Google Maps JS API key. Pass `null` /
   *   `undefined` / empty string to short-circuit to a rejected
   *   promise — the caller decides whether to surface a UI hint or
   *   silently fall back.
   * @throws Error when the key is empty, the runtime is non-browser
   *   (SSR), or the script tag fails to load.
   */
  load(apiKey: string | null | undefined): Promise<typeof google> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('Google Maps cannot load outside a browser.'));
    }

    // Already loaded by a previous call (or by another script on the
    // page) — return the namespace directly so the caller's
    // `await` resolves on the same microtask.
    const w = window as Window & { google?: typeof google };
    if (w.google?.maps?.places) {
      return Promise.resolve(w.google);
    }

    const trimmedKey = (apiKey ?? '').trim();
    if (!trimmedKey) {
      return Promise.reject(
        new Error('Google Maps API key is missing — set environment.googleMapsApiKey.'),
      );
    }

    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = new Promise<typeof google>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      // `loading=async` is the modern recommendation: it lets Google's
      // bootstrap defer the heavy work until the page is idle.
      // `libraries=places` keeps us out of the legacy geometry / drawing
      // bundles we don't use.
      script.src =
        'https://maps.googleapis.com/maps/api/js' +
        `?key=${encodeURIComponent(trimmedKey)}` +
        '&libraries=places' +
        '&loading=async';
      script.onload = () => {
        const wAfter = window as Window & { google?: typeof google };
        if (wAfter.google?.maps?.places) {
          resolve(wAfter.google);
        } else {
          this.loadingPromise = null;
          reject(new Error('Google Maps loaded but the Places library is missing.'));
        }
      };
      script.onerror = () => {
        this.loadingPromise = null;
        reject(new Error('Failed to load the Google Maps JS API.'));
      };
      document.head.appendChild(script);
    });

    return this.loadingPromise;
  }

  /**
   * Convenience helper for the common Address-autocomplete consumer:
   * loads the SDK and returns the `places` namespace ready to attach
   * to an `<input>`. Throws the same way {@link load} does.
   */
  async loadPlaces(
    apiKey: string | null | undefined,
  ): Promise<typeof google.maps.places> {
    const g = await this.load(apiKey);
    return g.maps.places;
  }
}
