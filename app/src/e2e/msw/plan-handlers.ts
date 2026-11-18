import { HttpResponse, http } from 'msw/http';
import {
  handleCreateSessionCheckout,
  handleGetPublicCatalog,
  handleGetSessionPortal,
  handleListSessionInvoices,
} from '@/api-client/msw.gen';
import { pageRequestOf } from '../../../e2e/app/_support/model/billing-pages';
import type { PlanAppModel } from '../../../e2e/app/_support/model/plan-app-model';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * The Kaiten Cloud the mocks stand for: where its public surface answers (the
 * build's `PLATFORM_API_URL`) and the publishable key it knows (the build's
 * `PLATFORM_PUBLISHABLE_KEY`). Without an address, nothing of it is served.
 */
export type MockedKaitenCloud = { apiUrl: string; publishableKey: string };

/**
 * The Plan & usage page: saas-api's `POST /plan/session` on the console's own API,
 * written by hand since `app/openapi.yaml` does not describe it, and, at the address
 * of Kaiten Cloud, the routes of the public surface the SDK reads in customer-session
 * mode (the portal, the invoices, the checkout) and the catalogue it reads with the
 * publishable key. Those are generated from the contract, so a path or a body the
 * contract changes breaks the type check. Each checks its credential as the API does.
 */
export const planHandlers = (
  model: PlanAppModel,
  persist: PersistMswState = noop,
  cloud: MockedKaitenCloud,
) => {
  const at = { baseUrl: cloud.apiUrl };
  const kaitenCloud = cloud.apiUrl
    ? [
        handleGetPublicCatalog(
          withProblems(({ request }) => {
            model.authenticateKey(request.headers, cloud.publishableKey);
            return HttpResponse.json(
              model.getCatalog(new URL(request.url).searchParams),
            );
          }),
          at,
        ),
        handleGetSessionPortal(
          withProblems(({ request }) => {
            model.authenticateSession(request.headers, Date.now());
            return HttpResponse.json(model.getPortal(Date.now()));
          }),
          at,
        ),
        handleListSessionInvoices(
          withProblems(({ request }) => {
            model.authenticateSession(request.headers, Date.now());
            return HttpResponse.json(
              model.listInvoices(
                pageRequestOf(new URL(request.url).searchParams),
              ),
            );
          }),
          at,
        ),
        handleCreateSessionCheckout(
          withProblems(async ({ request }) => {
            model.authenticateSession(request.headers, Date.now());
            const { body, status } = model.checkout(
              await request.json(),
              Date.now(),
            );
            persist();
            return HttpResponse.json(body, { status });
          }),
          at,
        ),
      ]
    : [];

  return [
    http.post(
      '*/api/plan/session',
      withProblems(() => {
        const session = model.createSession(Date.now());
        persist();
        return HttpResponse.json(session, { status: 201 });
      }),
    ),
    ...kaitenCloud,
  ];
};
