import { HttpResponse, http } from 'msw/http';
import {
  handleGetServiceAccount,
  handleGetServiceAccounts,
} from '@/api-client/msw.gen';
import type { E2EMswConfig } from '../../../e2e/app/_support/contracts/msw-slots';

// Every webhooks route: the list, the history and one webhook.
const WEBHOOKS_ROUTES = /\/api\/webhooks(?:\/[^?]*)?(?:\?.*)?$/;

/**
 * What a self-hosted deployment answers on the webhooks routes: nothing serves
 * them, so the paths do not exist. The default wherever the platform is not
 * passed through, registered after the stubs below so either one overrides it.
 */
export const noWebhooksServiceHandler = http.all(WEBHOOKS_ROUTES, () =>
  HttpResponse.json({ status: 404, title: 'Not Found' }, { status: 404 }),
);

/** Read-only integration surfaces; business CRUD uses its owning model. */
export function integrationStubHandlers(
  stubs: NonNullable<E2EMswConfig['integrationStubs']>,
) {
  return [
    ...(stubs.serviceAccount
      ? [
          handleGetServiceAccounts({
            body: { hasMore: false, items: [stubs.serviceAccount] },
          }),
          handleGetServiceAccount({ body: stubs.serviceAccount }),
        ]
      : []),
    ...(stubs.emptyWebhooks
      ? [
          http.get(/\/api\/webhooks$/, () => HttpResponse.json([])),
          http.get(/\/api\/webhooks\/history(?:\?.*)?$/, () =>
            HttpResponse.json({ history: [] }),
          ),
        ]
      : []),
    // Kaiten Cloud refusing an organization whose licence does not carry the
    // webhooks entitlement: every webhooks route, as saas-api does.
    ...(stubs.webhooksNotEntitled
      ? [
          http.all(WEBHOOKS_ROUTES, () =>
            HttpResponse.json(
              {
                status: 403,
                title: 'Forbidden',
                code: 'Webhooks.NotEntitled',
                detail:
                  "This organization's licence does not include outbound webhooks",
              },
              { status: 403 },
            ),
          ),
        ]
      : []),
  ];
}
