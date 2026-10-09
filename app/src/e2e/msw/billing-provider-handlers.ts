import { HttpResponse } from 'msw/http';
import {
  handleCompletePaymentMethodSession,
  handleCreatePaymentMethodSession,
  handleCreatePortalSession,
  handleDetachPaymentMethod,
  handleGetBillingHealth,
  handleGetCustomerBilling,
  handleSyncBillingProvider,
} from '@/api-client/msw.gen';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * What the payment provider adds to billing: the health of billing and the pass
 * that mirrors the provider, a customer as the provider holds it, and the
 * payment method the customer saves, replaces and removes through the pages the
 * provider hosts. Each answers as the API does, with the refusals of the state
 * the provider and the customer are in.
 */
export const billingProviderHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
) => {
  const { providers } = model;

  return [
    handleGetBillingHealth(
      withProblems(() => HttpResponse.json(providers.getHealth())),
    ),
    handleSyncBillingProvider(
      withProblems(() => {
        const report = providers.syncProvider();
        persist();
        return HttpResponse.json(report, { status: 202 });
      }),
    ),
    handleGetCustomerBilling(
      withProblems(({ params }) =>
        HttpResponse.json(providers.getCustomerBilling(params.customerSlug)),
      ),
    ),
    handleCreatePaymentMethodSession(
      withProblems(async ({ params, request }) => {
        const session = providers.createPaymentMethodSession(
          params.customerSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(session);
      }),
    ),
    handleCompletePaymentMethodSession(
      withProblems(({ params }) => {
        const completed = providers.completePaymentMethodSession(
          params.customerSlug,
          params.sessionId,
        );
        persist();
        return HttpResponse.json(completed);
      }),
    ),
    handleCreatePortalSession(
      withProblems(async ({ params, request }) =>
        HttpResponse.json(
          providers.createPortalSession(
            params.customerSlug,
            await request.json(),
          ),
        ),
      ),
    ),
    handleDetachPaymentMethod(
      withProblems(({ params }) => {
        providers.detachPaymentMethod(params.customerSlug);
        persist();
        return new HttpResponse(null, { status: 204 });
      }),
    ),
  ];
};
