import type { PublishableKey, ServiceAccount } from '@/api-client';
import { zServiceAccount } from '@/api-client/zod.gen';
import { parseContract } from '../_support/contracts/openapi-contract';
import { buildPublishableKey } from '../_support/fixtures';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';

/** The service account a token is created for, with no token yet. */
export function createSdkServiceAccount(): ServiceAccount {
  return parseContract(
    zServiceAccount,
    {
      id: 'service-account-1',
      name: 'SDK runtime',
      slug: 'sdk-runtime',
      createdAt: '2026-09-01T09:00:00Z',
      tokens: [],
    },
    'createSdkServiceAccount',
  );
}

/**
 * The publishable keys of a vendor whose pricing page reads the public catalogue: the
 * pricing page itself, a storefront that also runs from localhost, a docs site, and a
 * key that was revoked. Only the last four characters of a key are known to the API.
 */
export const PUBLISHABLE_KEYS: PublishableKey[] = [
  buildPublishableKey({
    allowedOrigins: ['https://shop.acme.test'],
    createdAt: '2026-09-01T12:00:00Z',
    id: 'pk-1',
    keyHint: 'a1B2',
    label: 'pricing',
    lastUsedAt: '2026-10-06T12:30:00Z',
  }),
  buildPublishableKey({
    allowedOrigins: ['https://old.acme.test'],
    createdAt: '2026-06-01T12:00:00Z',
    id: 'pk-2',
    keyHint: 'z9Y8',
    label: 'Legacy checkout',
    revokedAt: '2026-08-15T12:00:00Z',
  }),
  buildPublishableKey({
    allowedOrigins: ['https://store.acme.test', 'http://localhost:5173'],
    createdAt: '2026-09-10T12:00:00Z',
    id: 'pk-storefront',
    keyHint: 'c3D4',
    label: 'Storefront',
  }),
  buildPublishableKey({
    allowedOrigins: ['https://docs.acme.test'],
    createdAt: '2026-09-05T12:00:00Z',
    id: 'pk-docs',
    keyHint: 'e5F6',
    label: 'Docs',
    lastUsedAt: '2026-10-01T09:15:00Z',
  }),
];

/**
 * Billing on, as the API of the local stack serves it -- with `publicSurface` false,
 * which the API fixes whatever it can do, so that the page is seen to stand without it --
 * and the publishable keys above.
 */
export function createPublishableKeysBillingModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
    publishableKeys: { keys: PUBLISHABLE_KEYS },
  });
}

/** Billing on and no publishable key issued yet. */
export function createEmptyPublishableKeysBillingModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
  });
}
