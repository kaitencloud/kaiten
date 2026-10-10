import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type {
  InstanceBilling,
  Invoice,
  InvoicePreview,
  PageInvoiceSummary,
  StartedSubscription,
} from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import type { BillingAppModel } from '../../e2e/app/_support/model/billing-app-model';
import {
  buildInvoice,
  buildInvoiceLine,
} from '../../e2e/app/_support/fixtures/build-invoice';
import { ACME_LEGACY, BILLED_NOW } from '../../e2e/app/billing/billed-instances';
import { createSubscriptionsModel } from '../../e2e/app/billing/billing.scenarios';
import { server } from './msw-server';

// What the mocks standing in for the subscriptions of the instances and the billing
// defaults answer: the same refusals, with the same codes, in the same order as the
// API, because the console is tested against them. These read the answers off the
// wire, as the console does.

const API = 'http://api.test/api';

const install = (model: BillingAppModel) => {
  const config: E2EMswConfig = { billing: model.serializeForMsw() };
  server.use(
    ...createMockHandlers(config, 'off', undefined, true),
    undeclaredApiRequest,
  );
};

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });

const refusal = async (response: Response) =>
  (await response.json()) as { code?: string; detail?: string };

// The days around the moment the data of the scenario is dated to.
const daysFromNow = (days: number) =>
  new Date(Date.parse(BILLED_NOW) + days * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(BILLED_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the subscription of an instance, as the mocks serve it', () => {
  it('reads a subscription that lives and one that ended', async () => {
    install(createSubscriptionsModel());

    const live = (await (
      await send('GET', '/instances/acme-production/billing')
    ).json()) as InstanceBilling;
    const ended = (await (
      await send('GET', '/instances/acme-legacy/billing')
    ).json()) as InstanceBilling;

    expect(live).toMatchObject({
      daysUntilDue: 45,
      daysUntilDueOverride: 45,
      providerKind: 'NOOP',
      status: 'ACTIVE',
    });
    expect(live.basePrice.displayLabel).toBe('Enterprise, monthly');
    expect(ended).toMatchObject({ status: 'CANCELED' });
  });

  it('says an instance that was never subscribed has no subscription, and an unknown one the same', async () => {
    install(createSubscriptionsModel());

    const response = await send('GET', '/instances/beta-staging/billing');

    expect(response.status).toBe(404);
    expect((await refusal(response)).code).toBe('GetInstanceBilling.NotFound');
  });

  it('composes what the next boundary will issue, and says when it would be held', async () => {
    install(createSubscriptionsModel());

    const preview = (await (
      await send('GET', '/instances/acme-production/billing/upcoming-invoice')
    ).json()) as InvoicePreview;

    expect(preview.lines.map(({ label }) => label)).toEqual([
      'API calls, overage',
      'Enterprise, monthly',
    ]);
    expect(preview.total).toBe(50320);
    expect(preview.wouldHold).toEqual([
      expect.objectContaining({ invariant: 'LEDGER_SEQUENCE_GAP' }),
    ]);
  });

  it('has no upcoming invoice for a subscription that ended or that does not exist', async () => {
    install(createSubscriptionsModel());

    const ended = await send(
      'GET',
      '/instances/acme-legacy/billing/upcoming-invoice',
    );
    const none = await send(
      'GET',
      '/instances/beta-staging/billing/upcoming-invoice',
    );

    expect(ended.status).toBe(409);
    expect((await refusal(ended)).code).toBe('GetUpcomingInvoice.NotActive');
    expect(none.status).toBe(404);
    expect((await refusal(none)).code).toBe('GetUpcomingInvoice.NotFound');
  });

  it('lists the invoices of an instance, none for one never subscribed, and refuses one that does not exist', async () => {
    install(createSubscriptionsModel());

    const subscribed = (await (
      await send('GET', '/instances/acme-production/invoices')
    ).json()) as PageInvoiceSummary;
    const never = (await (
      await send('GET', '/instances/beta-staging/invoices')
    ).json()) as PageInvoiceSummary;
    const unknown = await send('GET', '/instances/nowhere/invoices');

    expect(subscribed.items.map(({ id }) => id)).toEqual([
      'inv-acme-renewal',
      'inv-acme-activation',
    ]);
    expect(never.items).toEqual([]);
    expect(unknown.status).toBe(404);
    expect((await refusal(unknown)).code).toBe(
      'ListInstanceInvoices.InstanceNotFound',
    );
  });
});

describe('subscribing an instance, as the mocks serve it', () => {
  it('starts the subscription on the price, issues the invoice of the first period when it bills in advance, and takes the terms of the organization', async () => {
    install(createSubscriptionsModel());

    const response = await send('POST', '/instances/beta-staging/billing', {
      basePriceId: 'price-starter-monthly',
    });
    const started = (await response.json()) as StartedSubscription;

    expect(response.status).toBeLessThan(300);
    expect(started).toMatchObject({
      collectionMethod: 'SEND_INVOICE',
      daysUntilDue: 30,
      providerKind: 'NOOP',
      status: 'ACTIVE',
    });
    expect(started.daysUntilDueOverride).toBeNull();
    expect(started.activationInvoice).toMatchObject({
      kind: 'ACTIVATION',
      status: 'MANUAL',
    });
    // What the other reads answer follows.
    const read = (await (
      await send('GET', '/instances/beta-staging/billing')
    ).json()) as InstanceBilling;
    const invoices = (await (
      await send('GET', '/instances/beta-staging/invoices')
    ).json()) as PageInvoiceSummary;
    expect(read.status).toBe('ACTIVE');
    expect(invoices.items.map(({ kind }) => kind)).toEqual(['ACTIVATION']);
  });

  it('issues nothing at once for a price billed in arrears, and keeps the terms and the start that were given', async () => {
    install(createSubscriptionsModel());

    const started = (await (
      await send('POST', '/instances/acme-legacy/billing', {
        basePriceId: 'price-enterprise-annual',
        daysUntilDue: 60,
        startAt: daysFromNow(-10),
      })
    ).json()) as StartedSubscription;

    expect(started.activationInvoice).toBeUndefined();
    expect(started).toMatchObject({
      anchorAt: daysFromNow(-10),
      daysUntilDue: 60,
      daysUntilDueOverride: 60,
    });
  });

  it('subscribes an instance again on the same row once its subscription ended', async () => {
    install(createSubscriptionsModel());
    const ended = (await (
      await send('GET', '/instances/acme-legacy/billing')
    ).json()) as InstanceBilling;

    const started = (await (
      await send('POST', '/instances/acme-legacy/billing', {
        basePriceId: 'price-enterprise-monthly',
      })
    ).json()) as StartedSubscription;

    expect(started.id).toBe(ended.id);
    expect(started.status).toBe('ACTIVE');
    expect(started.canceledAt).toBeNull();
  });

  it.each([
    [
      'an instance that is already subscribed',
      '/instances/acme-production/billing',
      { basePriceId: 'price-enterprise-monthly' },
      409,
      'SubscribeInstance.AlreadySubscribed',
    ],
    [
      'a version that is not on sale',
      '/instances/beta-lab/billing',
      { basePriceId: 'price-starter-monthly' },
      422,
      'SubscribeInstance.LicenseNotPublished',
    ],
    [
      'a price of another version',
      '/instances/beta-staging/billing',
      { basePriceId: 'price-enterprise-monthly' },
      422,
      'SubscribeInstance.PriceNotOnInstanceLicense',
    ],
    [
      'a price that does not exist',
      '/instances/beta-staging/billing',
      { basePriceId: 'price-nowhere' },
      404,
      'SubscribeInstance.PriceNotFound',
    ],
    [
      'a metered price',
      '/instances/acme-legacy/billing',
      { basePriceId: 'price-enterprise-calls' },
      422,
      'SubscribeInstance.PriceNotFlatFee',
    ],
    [
      'terms beyond a year',
      '/instances/beta-staging/billing',
      { basePriceId: 'price-starter-monthly', daysUntilDue: 400 },
      422,
      'SubscribeInstance.InvalidDaysUntilDue',
    ],
    [
      'a start in the future',
      '/instances/beta-staging/billing',
      { basePriceId: 'price-starter-monthly', startAt: daysFromNow(2) },
      422,
      'SubscribeInstance.StartAtInFuture',
    ],
    [
      'a start further back than a billing period',
      '/instances/beta-staging/billing',
      { basePriceId: 'price-starter-monthly', startAt: daysFromNow(-45) },
      422,
      'SubscribeInstance.StartAtTooEarly',
    ],
    [
      'an instance that does not exist',
      '/instances/nowhere/billing',
      { basePriceId: 'price-starter-monthly' },
      404,
      'SubscribeInstance.InstanceNotFound',
    ],
  ])('refuses %s', async (_name, path, body, status, code) => {
    install(createSubscriptionsModel());

    const response = await send('POST', path, body);

    expect(response.status).toBe(status);
    expect((await refusal(response)).code).toBe(code);
  });

  it('refuses a start that an invoice of the instance already bills', async () => {
    const model = createSubscriptionsModel();
    const startAt = daysFromNow(-10);
    // The first subscription of Acme Legacy began then, and its activation invoice is kept.
    model.invoices.addInvoice(
      buildInvoice({
        boundaryAt: startAt,
        id: 'inv-legacy-activation',
        identity: ACME_LEGACY,
        kind: 'ACTIVATION',
        lines: [
          buildInvoiceLine({
            amount: 49900,
            description: '1 × $499.00 per month',
            invoiceId: 'inv-legacy-activation',
            label: 'Enterprise, monthly',
            seq: 1,
            serviceFrom: startAt,
            serviceTo: daysFromNow(20),
            type: 'BASE',
            unitAmountDecimal: '49900',
          }),
        ],
        status: 'PAID',
      }),
    );
    install(model);

    const response = await send('POST', '/instances/acme-legacy/billing', {
      basePriceId: 'price-enterprise-monthly',
      startAt,
    });

    expect(response.status).toBe(409);
    expect((await refusal(response)).code).toBe(
      'SubscribeInstance.BoundaryConflict',
    );
  });
});

describe('the billing defaults, as the mocks serve them', () => {
  it('reads the defaults of the organization', async () => {
    install(createSubscriptionsModel());

    const settings = await (await send('GET', '/billing/settings')).json();

    expect(settings).toEqual({
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 30,
      handoffStripeInvoices: false,
    });
  });

  it('replaces the three members, and the terms follow for a subscription that names none', async () => {
    install(createSubscriptionsModel());

    const saved = await (
      await send('PUT', '/billing/settings', {
        defaultCollectionMethod: 'SEND_INVOICE',
        defaultDaysUntilDue: 15,
        handoffStripeInvoices: false,
      })
    ).json();
    const production = (await (
      await send('GET', '/instances/acme-production/billing')
    ).json()) as InstanceBilling;
    const started = (await (
      await send('POST', '/instances/beta-staging/billing', {
        basePriceId: 'price-starter-monthly',
      })
    ).json()) as StartedSubscription;

    expect(saved.defaultDaysUntilDue).toBe(15);
    // The contract of Acme Production names its own: it keeps it.
    expect(production.daysUntilDue).toBe(45);
    expect(started.daysUntilDue).toBe(15);
  });

  it('refuses terms beyond a year and a collection method that is neither of the two, with the code of each', async () => {
    install(createSubscriptionsModel());

    const days = await send('PUT', '/billing/settings', {
      defaultCollectionMethod: 'SEND_INVOICE',
      defaultDaysUntilDue: 366,
      handoffStripeInvoices: false,
    });
    const method = await send('PUT', '/billing/settings', {
      defaultCollectionMethod: 'WIRE_TRANSFER',
      defaultDaysUntilDue: 30,
      handoffStripeInvoices: false,
    });

    expect(days.status).toBe(422);
    expect((await refusal(days)).code).toBe(
      'UpdateBillingSettings.InvalidDaysUntilDue',
    );
    expect(method.status).toBe(422);
    expect((await refusal(method)).code).toBe(
      'UpdateBillingSettings.InvalidCollectionMethod',
    );
  });

  it('takes automatic collection as the default, which a subscription with no provider ignores', async () => {
    install(createSubscriptionsModel());

    const saved = await send('PUT', '/billing/settings', {
      defaultCollectionMethod: 'CHARGE_AUTOMATICALLY',
      defaultDaysUntilDue: 30,
      handoffStripeInvoices: false,
    });
    const subscription = (await (
      await send('GET', '/instances/acme-production/billing')
    ).json()) as InstanceBilling;

    expect(saved.status).toBe(200);
    expect(
      ((await (await send('GET', '/billing/settings')).json()) as {
        defaultCollectionMethod: string;
      }).defaultCollectionMethod,
    ).toBe('CHARGE_AUTOMATICALLY');
    // Nothing charges a NOOP invoice: it is sent, whatever the default.
    expect(subscription).toMatchObject({
      collectionMethod: 'SEND_INVOICE',
      providerKind: 'NOOP',
    });
  });

  it('refuses once with the problem a spec armed, then answers again', async () => {
    const model = createSubscriptionsModel();
    model.subscriptions.armProblem('getBillingSettings', {
      code: 'Billing.EntitlementCheckUnavailable',
      detail: 'The billing entitlement could not be checked',
      status: 503,
    });
    install(model);

    const first = await send('GET', '/billing/settings');
    const second = await send('GET', '/billing/settings');

    expect(first.status).toBe(503);
    expect((await refusal(first)).code).toBe('Billing.EntitlementCheckUnavailable');
    expect(second.status).toBe(200);
  });
});

describe('the invoices of a customer, as the mocks serve them', () => {
  it('lists the invoices of every instance of a customer, newest first', async () => {
    install(createSubscriptionsModel());

    const page = (await (
      await send('GET', '/invoices?customerSlug=acme-corp')
    ).json()) as PageInvoiceSummary;

    expect(page.items.map(({ instanceSlug }) => instanceSlug)).toEqual([
      'acme-production',
      'acme-production',
      'acme-legacy',
      'acme-legacy',
    ]);
    expect((page.items[0] as Invoice).id).toBe('inv-acme-renewal');
  });
});
