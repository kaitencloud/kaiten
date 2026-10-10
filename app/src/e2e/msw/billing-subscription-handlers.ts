import { HttpResponse } from 'msw/http';
import {
  handleCancelPlanChange,
  handleCancelSubscription,
  handleGetBillingSettings,
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleListInstanceInvoices,
  handleListLicensePrices,
  handleReactivateSubscription,
  handleSchedulePlanChange,
  handleSubscribeInstance,
  handleUpdateBillingSettings,
  handleUpdateInstanceBilling,
} from '@/api-client/msw.gen';
import type { Price } from '@/api-client';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import type { EntitlementEffects } from './billing-addon-handlers';
import { readInvoiceListQuery } from './billing-invoice-handlers';
import { withProblems } from './billing-problems';
import { asFallback } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

const BILLING_MODELS = ['FLAT_FEE', 'USAGE_BASED', 'OVERAGE'] as const;
const PRICE_STATUSES = ['ACTIVE', 'DEPRECATED'] as const;

const oneOf = <T extends string>(
  values: readonly T[],
  value: string | null,
): T | undefined => values.find((candidate) => candidate === value);

/**
 * The subscriptions of the instances: reading one, subscribing an instance,
 * cancelling it, taking the cancellation back, scheduling and dropping a plan
 * change, changing its terms, the invoice its next boundary will issue and the
 * invoices it already issued, and the billing defaults of the organization. Each answers as the API does, with the refusals it gives.
 * A subscribe that starts with add-ons tells the instances (`addonEffects`) that the
 * effective values of the one it started changed.
 *
 * The prices of a license version are served as a fallback: the slot of the
 * licenses owns them when it is installed, and the slot of the billing answers
 * for the versions it knows otherwise, so that an instance can be subscribed
 * without it.
 */
export const billingSubscriptionHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
  addonEffects?: EntitlementEffects,
) => {
  const { subscriptions } = model;

  return [
    handleGetInstanceBilling(
      withProblems(({ params }) =>
        HttpResponse.json(
          subscriptions.getInstanceBilling(params.instanceSlug),
        ),
      ),
    ),
    handleSubscribeInstance(
      withProblems(async ({ params, request }) => {
        const started = subscriptions.subscribe(
          params.instanceSlug,
          await request.json(),
        );
        persist();
        // The add-ons it was started with apply at once, like any other.
        addonEffects?.syncEffectiveValues(params.instanceSlug);
        return HttpResponse.json(started, { status: 201 });
      }),
    ),
    handleCancelSubscription(
      withProblems(async ({ params, request }) => {
        const canceled = subscriptions.cancelSubscription(
          params.instanceSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(canceled);
      }),
    ),
    handleReactivateSubscription(
      withProblems(({ params }) => {
        const reactivated = subscriptions.reactivateSubscription(
          params.instanceSlug,
        );
        persist();
        return HttpResponse.json(reactivated);
      }),
    ),
    handleSchedulePlanChange(
      withProblems(async ({ params, request }) => {
        const scheduled = subscriptions.schedulePlanChange(
          params.instanceSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(scheduled);
      }),
    ),
    handleCancelPlanChange(
      withProblems(({ params }) => {
        const dropped = subscriptions.cancelPlanChange(params.instanceSlug);
        persist();
        return HttpResponse.json(dropped);
      }),
    ),
    handleUpdateInstanceBilling(
      withProblems(async ({ params, request }) => {
        const updated = subscriptions.updateTerms(
          params.instanceSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(updated);
      }),
    ),
    handleGetUpcomingInvoice(
      withProblems(({ params }) =>
        HttpResponse.json(
          subscriptions.getUpcomingInvoice(params.instanceSlug),
        ),
      ),
    ),
    handleListInstanceInvoices(
      withProblems(({ params, request }) =>
        HttpResponse.json(
          subscriptions.listInstanceInvoices(
            params.instanceSlug,
            readInvoiceListQuery(new URL(request.url)),
          ),
        ),
      ),
    ),
    handleGetBillingSettings(
      withProblems(() => HttpResponse.json(subscriptions.getSettings())),
    ),
    handleUpdateBillingSettings(
      withProblems(async ({ request }) => {
        const settings = subscriptions.updateSettings(await request.json());
        persist();
        return HttpResponse.json(settings);
      }),
    ),
    asFallback(
      handleListLicensePrices(
        withProblems(({ params, request }) => {
          const query = new URL(request.url).searchParams;
          const prices: Price[] = subscriptions.listPrices(params.licenseSlug, {
            billingModel: oneOf(BILLING_MODELS, query.get('billingModel')),
            status: oneOf(PRICE_STATUSES, query.get('status')),
          });

          return HttpResponse.json(prices);
        }),
      ),
    ),
  ];
};
