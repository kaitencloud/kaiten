import { HttpResponse, http } from 'msw/http';
import {
  handleGetServiceAccount,
  handleGetServiceAccounts,
} from '@/api-client/msw.gen';
import type { E2EMswConfig } from '../../../e2e/app/_support/contracts/msw-slots';

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
  ];
}
