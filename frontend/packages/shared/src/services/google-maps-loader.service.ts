/// <reference types="google.maps" />

import { Injectable } from '@angular/core';

type MapsLibrary = 'places' | 'maps' | 'marker';

/**
 * Lazy loader for the Google Maps JS API with configurable libraries.
 * Extends the Places-only loader pattern used elsewhere in @wayel/shared.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private loadingPromise: Promise<typeof google> | null = null;
  private loadedLibraries = new Set<MapsLibrary>();

  load(
    apiKey: string | null | undefined,
    libraries: MapsLibrary[] = ['maps', 'marker'],
  ): Promise<typeof google> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('Google Maps cannot load outside a browser.'));
    }

    const w = window as Window & { google?: typeof google };
    const needsPlaces = libraries.includes('places');
    const needsMaps = libraries.includes('maps') || libraries.includes('marker');

    if (w.google?.maps && (!needsPlaces || w.google.maps.places) && (!needsMaps || w.google.maps.Map)) {
      libraries.forEach((lib) => this.loadedLibraries.add(lib));
      return Promise.resolve(w.google);
    }

    const trimmedKey = (apiKey ?? '').trim();
    if (!trimmedKey) {
      return Promise.reject(
        new Error('Google Maps API key is missing — set environment.googleMapsApiKey.'),
      );
    }

    if (this.loadingPromise) return this.loadingPromise;

    const libsParam = [...new Set(libraries)].join(',');

    this.loadingPromise = new Promise<typeof google>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.src =
        'https://maps.googleapis.com/maps/api/js' +
        `?key=${encodeURIComponent(trimmedKey)}` +
        `&libraries=${encodeURIComponent(libsParam)}` +
        '&loading=async';
      script.onload = () => {
        const wAfter = window as Window & { google?: typeof google };
        if (wAfter.google?.maps) {
          libraries.forEach((lib) => this.loadedLibraries.add(lib));
          resolve(wAfter.google);
        } else {
          this.loadingPromise = null;
          reject(new Error('Google Maps loaded but the maps namespace is missing.'));
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

  async createMap(
    apiKey: string | null | undefined,
    container: HTMLElement,
    center: google.maps.LatLngLiteral,
    options?: Partial<google.maps.MapOptions>,
  ): Promise<google.maps.Map> {
    const g = await this.load(apiKey, ['maps', 'marker']);
    return new g.maps.Map(container, {
      center,
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      ...options,
    });
  }
}
