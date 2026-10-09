import { HttpResponse } from 'msw';
import { Suspense, type ReactNode } from 'react';
import { server } from '@/__tests__/msw-server';
import type { PublishableKey } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListPublishableKeys,
} from '@/api-client/msw.gen';
import {
  createRouterModule,
  renderWithClient,
  sessionToken,
} from '@/test-fixtures/billing-test-support';
import { buildPublishableKey } from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';

/**
 * What the tests of the publishable key screens share: the router they read over plain
 * anchors, the sessions they hold, and the keys an organization has.
 */

/** Every scope the key screens ask, for a session that may do it all. */
export const ALL_SCOPES = [
  'read:billing',
  'read:publishable_keys',
  'write:publishable_keys',
  'read:licenses',
  'read:addons',
] as const;

export const READ_ONLY_SCOPES = [
  'read:billing',
  'read:publishable_keys',
  'read:licenses',
] as const;

export const sessionWith = (scopes: readonly string[] = ALL_SCOPES) =>
  sessionToken([...scopes]);

export const PRICING = buildPublishableKey({
  allowedOrigins: ['https://shop.acme.test'],
  createdAt: '2026-09-01T12:00:00Z',
  id: 'pk-1',
  keyHint: 'a1B2',
  label: 'pricing',
  lastUsedAt: '2026-10-06T12:30:00Z',
});
export const STOREFRONT = buildPublishableKey({
  allowedOrigins: [
    'https://store.acme.test',
    'http://localhost:5173',
    'https://eu.store.acme.test',
    'https://us.store.acme.test',
    'https://asia.store.acme.test',
  ],
  createdAt: '2026-09-10T12:00:00Z',
  id: 'pk-storefront',
  keyHint: 'c3D4',
  label: 'Storefront',
});
export const RENDERER = buildPublishableKey({
  createdAt: '2026-09-05T12:00:00Z',
  id: 'pk-renderer',
  keyHint: 'e5F6',
  label: 'Renderer',
});
export const LEGACY = buildPublishableKey({
  allowedOrigins: ['https://old.acme.test'],
  createdAt: '2026-06-01T12:00:00Z',
  id: 'pk-2',
  keyHint: 'z9Y8',
  label: 'Legacy checkout',
  revokedAt: '2026-08-15T12:00:00Z',
});

/** Serves billing on and the keys of the organization, with the revoked ones when they are asked for. */
export function serveKeys(
  keys: PublishableKey[] = [PRICING, STOREFRONT, RENDERER, LEGACY],
) {
  const requested: Array<string | null> = [];

  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stack(),
    }),
    handleListPublishableKeys(({ request }) => {
      const includeRevoked = new URL(request.url).searchParams.get(
        'includeRevoked',
      );
      requested.push(includeRevoked);

      return HttpResponse.json(
        keys.filter((key) => includeRevoked === 'true' || !key.revokedAt),
      );
    }),
  );

  return requested;
}

export { createRouterModule };

export function renderScreen(ui: ReactNode) {
  return renderWithClient(<Suspense fallback={null}>{ui}</Suspense>);
}
