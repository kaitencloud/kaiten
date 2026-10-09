import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import {
  type EntitlementEffects,
  billingAddonHandlers,
} from './billing-addon-handlers';
import { billingInvoiceHandlers } from './billing-invoice-handlers';
import { billingSubscriptionHandlers } from './billing-subscription-handlers';
import { billingVoucherHandlers } from './billing-voucher-handlers';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * The billing screens' API. The capabilities every billing screen gates on are
 * served here, and the model can be set to refuse them, or never to answer; the
 * invoices and the handoff queue are served by `billing-invoice-handlers`, the
 * subscriptions and the billing defaults by `billing-subscription-handlers`, the
 * add-ons, their catalogue and what the instances hold of it, by
 * `billing-addon-handlers`, and the vouchers, their catalogue and what the instances
 * redeemed of it, by `billing-voucher-handlers`.
 */
export const billingHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
  addonEffects?: EntitlementEffects,
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
  ...billingSubscriptionHandlers(model, persist, addonEffects),
  ...billingAddonHandlers(model, persist, addonEffects),
  ...billingVoucherHandlers(model, persist, addonEffects),
];
