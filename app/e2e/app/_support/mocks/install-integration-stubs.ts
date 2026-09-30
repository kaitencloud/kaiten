import type { Page } from '@playwright/test';
import type { ServiceAccount } from '@/api-client';
import { fulfillJson } from './rest-route-helpers';

// Read-only answers for the integration pages a spec opens to see what the
// platform flags show there. Those pages have no stateful model yet, and such a
// spec needs them to render, not to be edited.
//
// On the browser context rather than the page: once the MSW worker runs, a
// request it lets through is sent again by the service worker, which
// page.route() does not see and context.route() does. Matched on the pathname,
// so a list's paging query string does not slip past.

const apiPath = (path: string) => (url: URL) => url.pathname === `/api${path}`;

/** The service account whose token page opens, and the list around it. */
export async function installServiceAccountStub(
  page: Page,
  serviceAccount: ServiceAccount,
) {
  await page
    .context()
    .route(apiPath('/service-accounts'), (route) =>
      fulfillJson(route, 200, { hasMore: false, items: [serviceAccount] }),
    );
  await page
    .context()
    .route(apiPath(`/service-accounts/${serviceAccount.slug}`), (route) =>
      fulfillJson(route, 200, serviceAccount),
    );
}

/** No webhook and no delivery yet: the webhooks pages render empty. */
export async function installEmptyWebhooksStub(page: Page) {
  await page
    .context()
    .route(apiPath('/webhooks'), (route) => fulfillJson(route, 200, []));
  await page
    .context()
    .route(apiPath('/webhooks/history'), (route) =>
      fulfillJson(route, 200, { history: [] }),
    );
}
