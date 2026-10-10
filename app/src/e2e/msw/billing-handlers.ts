import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import {
  instanceBillingOperations,
  type LicenseCatalogue,
  licensePriceOperations,
} from '../../../e2e/app/_support/model/graphql-operations';
import {
  type EntitlementEffects,
  billingAddonHandlers,
} from './billing-addon-handlers';
import { billingInvoiceHandlers } from './billing-invoice-handlers';
import { billingProviderHandlers } from './billing-provider-handlers';
import { billingPublishableKeyHandlers } from './billing-publishable-key-handlers';
import { billingSubscriptionHandlers } from './billing-subscription-handlers';
import { billingVoucherHandlers } from './billing-voucher-handlers';
import { withProblems } from './billing-problems';
import { graphqlOperationHandler } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

/**
 * The billing screens' API. The capabilities every billing screen gates on are
 * served here, and the model can be set to refuse them, or never to answer; the
 * invoices and the handoff queue are served by `billing-invoice-handlers`, the
 * subscriptions and the billing defaults by `billing-subscription-handlers`, the
 * add-ons, their catalogue and what the instances hold of it, by
 * `billing-addon-handlers`, the vouchers, their catalogue and what the instances
 * redeemed of it, by `billing-voucher-handlers`, and what the payment provider adds
 * (the health, the pass that mirrors it, the customers and their payment methods) by
 * `billing-provider-handlers`, and the publishable keys a web page reads the public
 * catalogue with by `billing-publishable-key-handlers`.
 *
 * The lists read two documents of billing over GraphQL, each apart from the
 * documents they already had: the subscription of each instance
 * (`GetInstancesBilling`), which is the billing slot's own, and the licenses with
 * their active prices (`GetLicensesWithPrices`), which also needs to know where the
 * licenses are (`licenses`). A page that has no slot of licenses leaves that
 * document unanswered, as it does `GET /licenses`.
 */
export const billingHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
  addonEffects?: EntitlementEffects,
  licenses?: LicenseCatalogue,
) => [
  handleGetBillingCapabilities(
    withProblems(async () => {
      if (model.capabilitiesNeverAnswer()) {
        await delay('infinite');
      }
      return HttpResponse.json(model.getCapabilities());
    }),
  ),
  graphqlOperationHandler({
    ...instanceBillingOperations(model),
    ...(licenses ? licensePriceOperations(licenses) : {}),
  }),
  ...billingInvoiceHandlers(model, persist),
  ...billingProviderHandlers(model, persist),
  ...billingPublishableKeyHandlers(model, persist),
  ...billingSubscriptionHandlers(model, persist, addonEffects),
  ...billingAddonHandlers(model, persist, addonEffects),
  ...billingVoucherHandlers(model, persist, addonEffects),
];
