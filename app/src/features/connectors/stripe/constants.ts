import type { ConnectorMeta } from '../types';

/** The Stripe tile of the catalog. Where it stands is read from the billing capabilities. */
export const STRIPE_CONNECTOR: ConnectorMeta = {
  id: 'stripe',
  name: 'Stripe',
  tagline: 'Subscription billing',
  group: 'Billing',
  status: 'available',
  tile: 'success',
  initial: 'S',
};

/** How Kaiten's amounts relate to tax: they leave it out, or they include it. */
export const STRIPE_TAX_BEHAVIORS = ['EXCLUSIVE', 'INCLUSIVE'] as const;

export type StripeTaxBehavior = (typeof STRIPE_TAX_BEHAVIORS)[number];

/** What a connector with nothing stored says, as the schema of its settings does. */
export const STRIPE_SETTING_DEFAULTS = {
  autoFinalize: true,
  automaticTax: false,
  taxBehavior: 'EXCLUSIVE',
} as const satisfies {
  autoFinalize: boolean;
  automaticTax: boolean;
  taxBehavior: StripeTaxBehavior;
};

/**
 * The permissions the restricted key needs, as the connector documents them:
 * write on what Kaiten creates in Stripe, read on the events it mirrors.
 */
export const STRIPE_KEY_PERMISSIONS = [
  { access: 'write', resource: 'Customers' },
  { access: 'write', resource: 'Invoices' },
  { access: 'write', resource: 'Invoice items' },
  { access: 'write', resource: 'Coupons' },
  { access: 'write', resource: 'Payment methods' },
  { access: 'write', resource: 'Checkout Sessions' },
  { access: 'write', resource: 'Customer portal' },
  { access: 'read', resource: 'Events' },
] as const;

/** Where the Vault a self-hosted deployment needs is set up. */
export const SELF_HOSTING_DOCS_URL =
  'https://docs.kaiten.sh/docs/self-hosting/environment-variables';

/** Stripe's dashboard, in the mode the connection reaches. */
export const stripeDashboardUrl = (livemode: boolean | undefined) =>
  livemode
    ? 'https://dashboard.stripe.com'
    : 'https://dashboard.stripe.com/test';
