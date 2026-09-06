import { describe, expect, it } from 'vitest';
import { buildPublicShareUrl, DEFAULT_PUBLIC_WEB_ORIGIN, getPublicShareOrigin } from '../runtime';

describe('native runtime public URL policy', () => {
  it('keeps the current public origin for web shares', () => {
    expect(getPublicShareOrigin({
      native: false,
      currentOrigin: 'https://preview.example.com',
    })).toBe('https://preview.example.com');
  });

  it('uses the configured canonical HTTPS origin for native shares', () => {
    expect(getPublicShareOrigin({
      native: true,
      currentOrigin: 'capacitor://localhost',
      configuredOrigin: 'https://sadhvika.com/soleil',
    })).toBe('https://sadhvika.com');
  });

  it('preserves a native spot share query and hash on the configured root origin', () => {
    expect(buildPublicShareUrl('/?spot=chi-adler&view=now&hour=2026-08-31T02%3A00%3A00Z#forecast', {
      native: true,
      currentOrigin: 'capacitor://localhost',
      configuredOrigin: 'https://release.example',
    })).toBe(
      'https://release.example/?spot=chi-adler&view=now&hour=2026-08-31T02%3A00%3A00Z#forecast',
    );
  });

  it('makes path-bearing configuration behavior explicit for native links', () => {
    expect(buildPublicShareUrl('/?spot=sc-west-cliff&view=sunset', {
      native: true,
      configuredOrigin: 'https://release.example/soleil',
    })).toBe('https://release.example/?spot=sc-west-cliff&view=sunset');
  });

  it.each([
    'http://insecure.example.com',
    'capacitor://localhost',
    'not a URL',
  ])('falls back safely when the native origin is invalid: %s', (configuredOrigin) => {
    expect(getPublicShareOrigin({ native: true, configuredOrigin }))
      .toBe(DEFAULT_PUBLIC_WEB_ORIGIN);
  });
});
