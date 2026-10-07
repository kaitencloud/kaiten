import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { billingInvoiceHandlers } from './billing-invoice-handlers';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * The billing screens' API. The capabilities every billing screen gates on are
 * served here, and the model can be set to refuse them, or never to answer; the
 * invoices and the handoff queue are served by `billing-invoice-handlers`.
 */
export const billingHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
) => [
  handleGetBillingCapabilities(
    withProblems(async () => {
      if (model.capabilitiesNeverAnswer()) {
        await delay('infinite');
      }
      return HttpResponse.json(model.getCapabilities());
    }),
  ),
  ...billingInvoiceHandlers(model, persist),
];
