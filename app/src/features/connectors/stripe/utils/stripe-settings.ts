import type { ConnectorSettings } from '@/api-client';
import { STRIPE_SETTING_DEFAULTS, type StripeTaxBehavior } from '../constants';

/** What the connector stores of Stripe, as the page reads it: the options, and whether a key is on file. */
export type StripeSettings = {
  autoFinalize: boolean;
  automaticTax: boolean;
  /** The API never returns the key: it says whether there is one (`***`). */
  keyOnFile: boolean;
  taxBehavior: StripeTaxBehavior;
};

const isTaxBehavior = (value: unknown): value is StripeTaxBehavior =>
  value === 'EXCLUSIVE' || value === 'INCLUSIVE';

/** The settings the API returned, or the defaults of the connector when nothing is stored. */
export function readStripeSettings(
  stored: ConnectorSettings | null | undefined,
): StripeSettings {
  const settings = stored?.settings ?? {};
  const { autoFinalize, automaticTax, stripeSecretKey, taxBehavior } = settings;

  return {
    autoFinalize:
      typeof autoFinalize === 'boolean'
        ? autoFinalize
        : STRIPE_SETTING_DEFAULTS.autoFinalize,
    automaticTax:
      typeof automaticTax === 'boolean'
        ? automaticTax
        : STRIPE_SETTING_DEFAULTS.automaticTax,
    keyOnFile: typeof stripeSecretKey === 'string' && stripeSecretKey !== '',
    taxBehavior: isTaxBehavior(taxBehavior)
      ? taxBehavior
      : STRIPE_SETTING_DEFAULTS.taxBehavior,
  };
}

/**
 * Which Stripe account a restricted key reaches, read from its prefix as the
 * connector reads it: `rk_live_` the live account, `rk_test_` a test one; any
 * other key is none yet.
 */
export function getKeyMode(key: string): 'live' | 'test' | undefined {
  if (key.startsWith('rk_live_')) {
    return 'live';
  }

  return key.startsWith('rk_test_') ? 'test' : undefined;
}
