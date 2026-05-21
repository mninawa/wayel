import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentStrings, setStrings, t } from './strings';

/**
 * The runtime dictionary is module-global; we snapshot it before each test
 * and restore afterwards so cases stay independent.
 */
let snapshot: Record<string, string>;

beforeEach(() => {
  snapshot = { ...currentStrings() };
});

afterEach(() => {
  setStrings(snapshot);
});

describe('i18n / t()', () => {
  it('returns the value for a known key', () => {
    expect(t('common.copied')).toBe('Copied to clipboard.');
  });

  it('falls back to the key itself when missing — surfaces gaps in dev', () => {
    expect(t('totally.unknown.key')).toBe('totally.unknown.key');
  });

  it('substitutes a single {placeholder}', () => {
    setStrings({ 'demo.hello': 'Hi {name}!' });
    expect(t('demo.hello', { name: 'Alice' })).toBe('Hi Alice!');
  });

  it('substitutes multiple placeholders, repeated and adjacent', () => {
    setStrings({ 'demo.pair': '{a}-{b}-{a}' });
    expect(t('demo.pair', { a: 1, b: 2 })).toBe('1-2-1');
  });

  it('leaves unmatched placeholders intact (so missing keys are visible)', () => {
    setStrings({ 'demo.partial': 'Hi {name}, your code is {code}.' });
    expect(t('demo.partial', { name: 'Alice' })).toBe(
      'Hi Alice, your code is {code}.',
    );
  });

  it('treats null/undefined params as unmatched (does NOT print "null")', () => {
    setStrings({ 'demo.nullable': 'X={x} Y={y}' });
    expect(t('demo.nullable', { x: null, y: undefined })).toBe('X={x} Y={y}');
  });

  it('coerces non-string params via String()', () => {
    setStrings({ 'demo.num': 'count={n}' });
    expect(t('demo.num', { n: 7 })).toBe('count=7');
    expect(t('demo.num', { n: true })).toBe('count=true');
  });

  it('does not greedily match unknown brace patterns like {} or {1}', () => {
    setStrings({ 'demo.loose': 'a {} b {1} c {ok}' });
    expect(t('demo.loose', { ok: 'OK' })).toBe('a {} b {1} c OK');
  });
});

describe('i18n / setStrings()', () => {
  it('merges new keys into the active dictionary without dropping existing ones', () => {
    const before = currentStrings()['common.copied'];
    setStrings({ 'demo.added': 'added!' });
    expect(t('common.copied')).toBe(before);
    expect(t('demo.added')).toBe('added!');
  });

  it('overrides existing keys when re-setting them (locale switch shape)', () => {
    setStrings({ 'common.copied': 'Skopieer.' });
    expect(t('common.copied')).toBe('Skopieer.');
  });

  it('returns the previous dictionary so callers can roll back in tests', () => {
    const prev = setStrings({ 'demo.x': 'y' });
    expect(prev['common.copied']).toBe('Copied to clipboard.');
  });
});
