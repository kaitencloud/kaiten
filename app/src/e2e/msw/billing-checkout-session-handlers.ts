import { HttpResponse } from 'msw/http';
import {
  handleGetCheckoutSessionAdmin,
  handleListCheckoutSessions,
} from '@/api-client/msw.gen';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { pageRequestOf } from '../../../e2e/app/_support/model/billing-pages';
import { withProblems } from './billing-problems';

/**
 * The anonymous checkouts the vendor reads: listing them newest first with the filters
 * the API applies (the console applies its own in the browser and asks for none), and
 * reading one. They only read: the model has nothing to change, because a checkout is
 * started, confirmed and completed on the public surface alone.
 */
export const billingCheckoutSessionHandlers = (model: BillingAppModel) => {
  const { checkoutSessions } = model;

  return [
    handleListCheckoutSessions(
      withProblems(({ request }) => {
        const query = new URL(request.url).searchParams;

        return HttpResponse.json(
          checkoutSessions.listSessions(
            {
              clientReferenceId: query.get('clientReferenceId'),
              email: query.get('email'),
              status: query.getAll('status'),
            },
            pageRequestOf(query),
          ),
        );
      }),
    ),
    handleGetCheckoutSessionAdmin(
      withProblems(({ params }) =>
        HttpResponse.json(checkoutSessions.getSession(params.sessionId)),
      ),
    ),
  ];
};
