import type { StripeStanding } from '../../../e2e/app/_support/model/billing-capabilities';
import { startE2EMockServiceWorker } from './browser';
import { createDevMockConfig } from './dev-world';

const STRIPE_STANDINGS: readonly StripeStanding[] = [
  'available',
  'connected',
  'connectedLive',
  'notEntitled',
  'vaultMissing',
];

/**
 * Where the Stripe connector starts: connected to a test account, unless the
 * address names another (`?stripe=vaultMissing`, `notEntitled`, `available` or
 * `connectedLive`), so that each state of its page can be looked at. It is read
 * when a tab starts, and what the tab changes lives in `sessionStorage` after that.
 */
const readStripeStanding = (): StripeStanding => {
  const asked = new URLSearchParams(window.location.search).get('stripe');

  return STRIPE_STANDINGS.find((standing) => standing === asked) ?? 'connected';
};

/**
 * The console without a backend (`pnpm run dev:mock`, VITE_MOCK_API=true): the
 * API answered by Mock Service Worker in the page, every area seeded from one
 * world (./dev-world). A request no area serves prints an `[MSW]` warning that
 * names it. What a page changes lives in `sessionStorage`, so it survives a
 * reload and a new tab starts over; so does a change to the mocks' own code
 * (./browser.ts).
 */
export async function startDevMocks() {
  await startE2EMockServiceWorker(
    createDevMockConfig({ stripe: readStripeStanding() }),
    { warnUnhandledApiRequests: true },
  );
}
