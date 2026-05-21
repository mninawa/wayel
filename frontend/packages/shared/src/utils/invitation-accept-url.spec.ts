import { afterEach, describe, expect, it } from 'vitest';
import {
  buildInvitationAcceptUrl,
  preferServerAcceptUrl,
} from './invitation-accept-url';

describe('buildInvitationAcceptUrl()', () => {
  afterEach(() => {
    // @ts-expect-error – tear down the window shim per test.
    delete globalThis.window;
  });

  it('uses window.location.origin when no override is supplied', () => {
    // @ts-expect-error – minimal Location shim.
    globalThis.window = { location: { origin: 'https://parents.sun-valley.example' } };

    const url = buildInvitationAcceptUrl('abc-123');

    expect(url).toBe('https://parents.sun-valley.example/invitations/accept?token=abc-123');
  });

  it('honours an explicit originOverride and trims trailing slashes', () => {
    // window present but the override should win — preview-as-tenant case.
    // @ts-expect-error – Location shim.
    globalThis.window = { location: { origin: 'https://app.wayel.example' } };

    const url = buildInvitationAcceptUrl(
      'abc-123',
      'https://parents.little-stars.example/',
    );

    expect(url).toBe('https://parents.little-stars.example/invitations/accept?token=abc-123');
  });

  it('URL-encodes the token so a future "+" or "/" in the alphabet is safe', () => {
    // @ts-expect-error – Location shim.
    globalThis.window = { location: { origin: 'https://x.example' } };

    const url = buildInvitationAcceptUrl('a+b/c=d');

    expect(url).toBe('https://x.example/invitations/accept?token=a%2Bb%2Fc%3Dd');
  });

  it('returns an empty string when no token is supplied', () => {
    // @ts-expect-error – Location shim.
    globalThis.window = { location: { origin: 'https://x.example' } };

    expect(buildInvitationAcceptUrl('   ')).toBe('');
    expect(buildInvitationAcceptUrl('')).toBe('');
  });

  it('emits a path-only URL in non-browser contexts so the result is still pasteable', () => {
    // No `window` shim → SSR / test fallback.
    const url = buildInvitationAcceptUrl('abc-123');
    expect(url).toBe('/invitations/accept?token=abc-123');
  });
});

describe('preferServerAcceptUrl()', () => {
  afterEach(() => {
    // @ts-expect-error – tear down the window shim per test.
    delete globalThis.window;
  });

  it('returns the server-supplied URL verbatim when present', () => {
    // @ts-expect-error – Location shim. We deliberately give the SPA a
    // *different* origin to prove the server URL takes precedence.
    globalThis.window = { location: { origin: 'https://app.wayel.example' } };

    const url = preferServerAcceptUrl(
      'https://parents.sun-valley.example/invitations/accept?token=opaque',
      'opaque',
    );

    expect(url).toBe(
      'https://parents.sun-valley.example/invitations/accept?token=opaque',
    );
  });

  it('trims surrounding whitespace from the server URL', () => {
    const url = preferServerAcceptUrl(
      '  https://x.example/invitations/accept?token=t  ',
      't',
    );
    expect(url).toBe('https://x.example/invitations/accept?token=t');
  });

  it('falls back to the client-built URL when the server returned null', () => {
    // @ts-expect-error – Location shim.
    globalThis.window = { location: { origin: 'https://app.wayel.example' } };

    const url = preferServerAcceptUrl(null, 'tok');

    expect(url).toBe('https://app.wayel.example/invitations/accept?token=tok');
  });

  it('falls back to the client-built URL when the server returned an empty string', () => {
    // @ts-expect-error – Location shim.
    globalThis.window = { location: { origin: 'https://app.wayel.example' } };

    const url = preferServerAcceptUrl('   ', 'tok');

    expect(url).toBe('https://app.wayel.example/invitations/accept?token=tok');
  });

  it('respects an originOverride on the fallback path', () => {
    const url = preferServerAcceptUrl(
      undefined,
      'tok',
      'https://parents.little-stars.example',
    );
    expect(url).toBe(
      'https://parents.little-stars.example/invitations/accept?token=tok',
    );
  });
});
