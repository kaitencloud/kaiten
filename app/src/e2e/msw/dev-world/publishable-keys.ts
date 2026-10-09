import { buildPublishableKey } from '../../../../e2e/app/_support/fixtures/build-publishable-key';
import type { BillingPublishableKeysSeed } from '../../../../e2e/app/_support/model/billing-publishable-keys';
import { daysAgo, minutesAgo } from './dates';

/**
 * The publishable keys of the vendor, in every state the page shows: the pricing page
 * that reads the catalogue from two origins and was used minutes ago, a staging page on
 * localhost that was never used, a server-side renderer with no browser origin at all,
 * and two keys that were revoked, one of them a docs site retired a month ago. The keys
 * themselves are not in the world: the API keeps their digest, and shows the last four
 * characters.
 */
export function createPublishableKeys(): BillingPublishableKeysSeed {
  return {
    keys: [
      buildPublishableKey({
        allowedOrigins: [
          'https://www.example.com',
          'https://pricing.example.com',
        ],
        createdAt: daysAgo(90),
        id: 'publishable-key-pricing',
        keyHint: 'x9Qa',
        label: 'Pricing page',
        lastUsedAt: minutesAgo(12),
      }),
      buildPublishableKey({
        allowedOrigins: [
          'http://localhost:5173',
          'https://staging.example.com',
        ],
        createdAt: daysAgo(21),
        id: 'publishable-key-staging',
        keyHint: 'b4Tz',
        label: 'Staging storefront',
      }),
      buildPublishableKey({
        createdAt: daysAgo(45),
        id: 'publishable-key-renderer',
        keyHint: 'm7Lc',
        label: 'Server-side renderer',
        lastUsedAt: daysAgo(1),
      }),
      buildPublishableKey({
        allowedOrigins: ['https://docs.example.com'],
        createdAt: daysAgo(200),
        id: 'publishable-key-docs',
        keyHint: 'q2Rn',
        label: 'Docs site',
        lastUsedAt: daysAgo(31),
        revokedAt: daysAgo(30),
      }),
      buildPublishableKey({
        allowedOrigins: ['https://shop.example.com'],
        createdAt: daysAgo(320),
        id: 'publishable-key-shop',
        keyHint: 'h8Vw',
        label: 'Old storefront',
        lastUsedAt: daysAgo(190),
        revokedAt: daysAgo(180),
      }),
    ],
  };
}
