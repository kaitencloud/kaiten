import type { StripeStanding } from '../../../e2e/app/_support/model/billing-capabilities';
import { startE2EMockServiceWorker } from './browser';
import { createDevMockConfig } from './dev-world';
import type { AiBilling, AiCatalogue, AiStanding } from './dev-world/ai';

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

/** Whether AI credits start on: on, unless the address says `?ai=off`. */
const readAiStanding = (): AiStanding =>
  new URLSearchParams(window.location.search).get('ai') === 'off'
    ? 'off'
    : 'on';

const asked = (name: string) =>
  new URLSearchParams(window.location.search).get(name);

/** The AI catalogue: the default one, unless the address says `?catalogue=large`. */
const readAiCatalogue = (): AiCatalogue =>
  asked('catalogue') === 'large' ? 'large' : 'default';

/** Add-on grants readable, unless the address says `?addonGrants=billing-off`. */
const readAiBilling = (): AiBilling =>
  asked('addonGrants') === 'billing-off' ? 'off' : 'on';

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
    createDevMockConfig({
      ai: readAiStanding(),
      aiBilling: readAiBilling(),
      aiCatalogue: readAiCatalogue(),
      stripe: readStripeStanding(),
    }),
    { warnUnhandledApiRequests: true },
  );
}
