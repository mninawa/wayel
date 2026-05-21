import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

describe('formatRelativeTime()', () => {
  // Pin "now" so all assertions are deterministic.
  const now = new Date('2026-05-02T14:00:00.000Z');

  it('returns an empty string for null / undefined / unparseable inputs', () => {
    expect(formatRelativeTime(null, now)).toBe('');
    expect(formatRelativeTime(undefined, now)).toBe('');
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });

  it('treats anything within the last minute (and the future) as "Just now"', () => {
    expect(formatRelativeTime('2026-05-02T13:59:30.000Z', now)).toBe('Just now');
    expect(formatRelativeTime('2026-05-02T14:00:00.000Z', now)).toBe('Just now');
    expect(formatRelativeTime('2026-05-02T14:00:30.000Z', now)).toBe('Just now');
  });

  it('renders minutes / hours / days for fresh rows', () => {
    expect(formatRelativeTime('2026-05-02T13:55:00.000Z', now)).toBe('5m ago');
    expect(formatRelativeTime('2026-05-02T11:00:00.000Z', now)).toBe('3h ago');
    expect(formatRelativeTime('2026-04-30T14:00:00.000Z', now)).toBe('2d ago');
  });

  it('rolls over to weeks / months / years for older rows', () => {
    expect(formatRelativeTime('2026-04-22T14:00:00.000Z', now)).toBe('1w ago');
    expect(formatRelativeTime('2026-03-02T14:00:00.000Z', now)).toBe('2mo ago');
    expect(formatRelativeTime('2024-05-02T14:00:00.000Z', now)).toBe('2y ago');
  });

  it('accepts Date instances directly', () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo, now)).toBe('5m ago');
  });
});
