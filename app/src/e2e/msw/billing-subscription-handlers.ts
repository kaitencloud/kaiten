import { HttpResponse } from 'msw/http';
import {
  handleGetBillingSettings,
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleListInstanceInvoices,
  handleListLicensePrices,
  handleSubscribeInstance,
  handleUpdateBillingSettings,
} from '@/api-client/msw.gen';
import type { Price } from '@/api-client';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
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
 * The subscriptions of the instances: reading one, subscribing an instance, the
 * invoice its next boundary will issue and the invoices it already issued, and
 * the billing defaults of the organization. Each answers as the API does, with
 * the refusals it gives.
 *
 * The prices of a license version are served as a fallback: the slot of the
 * licenses owns them when it is installed, and the slot of the billing answers
 * for the versions it knows otherwise, so that an instance can be subscribed
 * without it.
 */
export const billingSubscriptionHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
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
        return HttpResponse.json(started, { status: 201 });
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
