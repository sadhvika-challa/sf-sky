import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLIC_WEB_ORIGIN, getPublicShareOrigin } from '../runtime';

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

  it.each([
    'http://insecure.example.com',
    'capacitor://localhost',
    'not a URL',
  ])('falls back safely when the native origin is invalid: %s', (configuredOrigin) => {
    expect(getPublicShareOrigin({ native: true, configuredOrigin }))
      .toBe(DEFAULT_PUBLIC_WEB_ORIGIN);
  });
});
