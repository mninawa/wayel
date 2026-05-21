import { describe, expect, it } from 'vitest';
import { buildPreviewAsTenantUrl } from './preview-as-tenant-url';

describe('buildPreviewAsTenantUrl()', () => {
  it('appends ?previewHost to the SPA root for the simple case', () => {
    const url = buildPreviewAsTenantUrl(
      'https://app.wayel.example',
      'parents.sun-valley.example',
    );
    expect(url).toBe(
      'https://app.wayel.example/?previewHost=parents.sun-valley.example',
    );
  });

  it('lowercases and trims the host so a copy-paste with stray case still works', () => {
    const url = buildPreviewAsTenantUrl(
      'https://app.wayel.example',
      '  Parents.Sun-Valley.Example ',
    );
    expect(url).toBe(
      'https://app.wayel.example/?previewHost=parents.sun-valley.example',
    );
  });

  it('strips a leading scheme so the override is a host header, not a URL', () => {
    // The BFF compares the override against `branding.customDomain`,
    // which is stored without scheme. A SuperAdmin pasting in a full
    // URL by mistake shouldn't break the round trip.
    const url = buildPreviewAsTenantUrl(
      'https://app.wayel.example',
      'https://parents.little-stars.example/',
    );
    expect(url).toBe(
      'https://app.wayel.example/?previewHost=parents.little-stars.example',
    );
  });

  it('URL-encodes hosts that contain reserved characters', () => {
    // Punycoded IDNs are pure ASCII so they don't trigger encoding,
    // but the encodeURIComponent call still has to handle stray
    // characters that find their way in (e.g. the operator typed a
    // path or a colon). We assert the encoding is happening so a
    // future "smart paste" feature can't bypass it.
    const url = buildPreviewAsTenantUrl(
      'https://app.wayel.example',
      'parents.example/path with spaces',
    );
    expect(url).toBe(
      'https://app.wayel.example/?previewHost=parents.example%2Fpath%20with%20spaces',
    );
  });

  it('strips a trailing slash off the origin so we never emit "//?"', () => {
    const url = buildPreviewAsTenantUrl(
      'https://app.wayel.example/',
      'parents.example',
    );
    expect(url).toBe('https://app.wayel.example/?previewHost=parents.example');
  });
});
