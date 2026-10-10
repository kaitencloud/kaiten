import { describe, expect, it } from 'vite-plus/test';
import type { ConnectorSettings } from '@/api-client';
import { getKeyMode, readStripeSettings } from './stripe-settings';

const stored = (settings: Record<string, unknown>): ConnectorSettings => ({
  connector_name: 'kaiten.integration.billing.stripe',
  settings,
});

describe('reading the settings of the Stripe connector', () => {
  it('says what the connector assumes when nothing is stored', () => {
    expect(readStripeSettings(null)).toEqual({
      autoFinalize: true,
      automaticTax: false,
      keyOnFile: false,
      taxBehavior: 'EXCLUSIVE',
    });
    expect(readStripeSettings(undefined)).toEqual(readStripeSettings(null));
  });

  it('reads the options as they are stored, and a redacted key as a key on file', () => {
    expect(
      readStripeSettings(
        stored({
          autoFinalize: false,
          automaticTax: true,
          stripeSecretKey: '***',
          taxBehavior: 'INCLUSIVE',
        }),
      ),
    ).toEqual({
      autoFinalize: false,
      automaticTax: true,
      keyOnFile: true,
      taxBehavior: 'INCLUSIVE',
    });
  });

  it('falls back to the default of an option that is not of the type it should be', () => {
    expect(
      readStripeSettings(
        stored({
          autoFinalize: 'no',
          automaticTax: 1,
          stripeSecretKey: '',
          taxBehavior: 'REVERSE',
        }),
      ),
    ).toEqual({
      autoFinalize: true,
      automaticTax: false,
      keyOnFile: false,
      taxBehavior: 'EXCLUSIVE',
    });
  });
});

describe('the account a key reaches', () => {
  it('is read from the prefix of a restricted key', () => {
    expect(getKeyMode('rk_live_51Habc')).toBe('live');
    expect(getKeyMode('rk_test_51Habc')).toBe('test');
  });

  it('is none for a key that is not a restricted one', () => {
    expect(getKeyMode('')).toBeUndefined();
    expect(getKeyMode('rk_')).toBeUndefined();
    expect(getKeyMode('sk_live_51Habc')).toBeUndefined();
    expect(getKeyMode('pk_test_51Habc')).toBeUndefined();
  });
});
