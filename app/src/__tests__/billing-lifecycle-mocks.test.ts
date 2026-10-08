import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type {
  CanceledSubscription,
  InstanceAddon,
  InstanceBilling,
  PageInvoiceSummary,
  StartedSubscription,
} from '@/api-client';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import type { E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import type { BillingAppModel } from '../../e2e/app/_support/model/billing-app-model';
import {
  createLifecycleBillingModel,
  ENTERPRISE_V1_IN_EURO,
  LIFECYCLE_NOW,
  PRO_V2_ANNUAL_IN_ARREARS,
  PRO_V2_MONTHLY,
  PRO_V3_MONTHLY,
  PRO_V5_RETIRED,
} from '../../e2e/app/billing/lifecycle-world';
import { server } from './msw-server';

// What the mocks standing in for the life of a subscription answer: the same
// refusals, with the same codes, in the order the API checks, because the console
// is tested against them (api/internal/modules/billing/cancelsubscription,
// reactivatesubscription, scheduleplanchange, cancelplanchange,
// updateinstancebilling). These read the answers off the wire, as the console does.

const API = 'http://api.test/api';

const install = (model: BillingAppModel = createLifecycleBillingModel()) => {
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

const read = async (slug: string) =>
  (await (await send('GET', `/instances/${slug}/billing`)).json()) as InstanceBilling;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(LIFECYCLE_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cancelling a subscription, as the mocks serve it', () => {
  it('schedules the end of the period and leaves the status, as the API does, and repeating it changes nothing', async () => {
    install();

    const first = (await (
      await send('POST', '/instances/initech-prod/billing/cancel', {
        mode: 'AT_PERIOD_END',
        reason: 'budget',
      })
    ).json()) as CanceledSubscription;
    const again = await send('POST', '/instances/initech-prod/billing/cancel', {
      mode: 'AT_PERIOD_END',
      reason: 'another reason',
    });

    expect(first).toMatchObject({
      cancelAtPeriodEnd: true,
      cancelRequestedAt: LIFECYCLE_NOW,
      cancellationReason: 'budget',
      status: 'ACTIVE',
    });
    expect(first.finalInvoice).toBeUndefined();
    expect(again.status).toBe(200);
    expect((await read('initech-prod')).cancellationReason).toBe('budget');
  });

  it('drops a plan change that was scheduled, in the same write', async () => {
    install();

    const canceled = (await (
      await send('POST', '/instances/initech-moving/billing/cancel', {})
    ).json()) as CanceledSubscription;

    expect(canceled.cancelAtPeriodEnd).toBe(true);
    expect(canceled.scheduledChange).toBeUndefined();
  });

  it('issues the final invoice at once when it is immediate: the arrears of the period, nothing refunded', async () => {
    install();

    const response = await send('POST', '/instances/initech-prod/billing/cancel', {
      mode: 'IMMEDIATE',
      reason: 'now',
    });
    const canceled = (await response.json()) as CanceledSubscription;

    expect(response.status).toBe(200);
    expect(canceled).toMatchObject({
      cancelAtPeriodEnd: false,
      canceledAt: LIFECYCLE_NOW,
      cancellationReason: 'now',
      status: 'CANCELED',
    });
    // A base billed in advance was paid when the period began: the final invoice
    // has nothing in arrears, totals nothing and is paid at once, never handed off.
    expect(canceled.finalInvoice).toMatchObject({
      kind: 'FINAL',
      status: 'PAID',
      total: 0,
    });
    const invoices = (await (
      await send('GET', '/instances/initech-prod/invoices')
    ).json()) as PageInvoiceSummary;
    expect(invoices.items.map(({ kind }) => kind)).toContain('FINAL');
  });

  it('bills a base in arrears in full for the part of the period gone by, with no proration', async () => {
    install();
    await send('POST', '/instances/initech-fresh/billing', {
      basePriceId: PRO_V2_ANNUAL_IN_ARREARS.id,
      trialDays: 0,
    });

    const canceled = (await (
      await send('POST', '/instances/initech-fresh/billing/cancel', {
        mode: 'IMMEDIATE',
      })
    ).json()) as CanceledSubscription;

    expect(canceled.finalInvoice).toMatchObject({
      kind: 'FINAL',
      status: 'MANUAL',
      total: 29000,
    });
  });

  it('ends a trial at once with no invoice, whatever the mode', async () => {
    install();

    const canceled = (await (
      await send('POST', '/instances/initech-trial/billing/cancel', {
        mode: 'AT_PERIOD_END',
      })
    ).json()) as CanceledSubscription;

    expect(canceled).toMatchObject({ status: 'CANCELED' });
    expect(canceled.finalInvoice).toBeUndefined();
  });

  it('clears what a canceled subscription no longer has: the overdue mark and the plan change', async () => {
    install();

    const canceled = (await (
      await send('POST', '/instances/initech-late/billing/cancel', {
        mode: 'IMMEDIATE',
      })
    ).json()) as CanceledSubscription;

    expect(canceled.pastDueSince).toBeUndefined();
    expect(canceled.status).toBe('CANCELED');
  });

  it.each([
    [
      'a reason of more than 500 characters',
      '/instances/initech-prod/billing/cancel',
      { reason: 'é'.repeat(501) },
      422,
      'CancelSubscription.InvalidReason',
    ],
    [
      'a subscription that ended',
      '/instances/hooli-prod/billing/cancel',
      {},
      409,
      'CancelSubscription.NotActive',
    ],
    [
      'an instance never subscribed',
      '/instances/initech-fresh/billing/cancel',
      {},
      404,
      'CancelSubscription.NotFound',
    ],
  ])('refuses %s', async (_name, path, body, status, code) => {
    install();

    const response = await send('POST', path, body);

    expect(response.status).toBe(status);
    expect((await refusal(response)).code).toBe(code);
  });

  it('counts the reason in characters, as the API does, so 500 of them are accepted', async () => {
    install();

    const response = await send('POST', '/instances/initech-prod/billing/cancel', {
      reason: 'é'.repeat(500),
    });

    expect(response.status).toBe(200);
  });

  it('refuses while the period has ended and its close has not run, and changes nothing', async () => {
    install();
    vi.setSystemTime(new Date('2026-10-15T00:00:00.000Z'));

    const response = await send('POST', '/instances/initech-prod/billing/cancel', {});

    expect(response.status).toBe(409);
    expect((await refusal(response)).code).toBe('CancelSubscription.BoundaryPending');
    expect((await read('initech-prod')).cancelAtPeriodEnd).toBe(false);
  });
});

describe('reactivating a subscription, as the mocks serve it', () => {
  it('takes a cancellation back, with its date and its reason', async () => {
    install();

    const reactivated = (await (
      await send('POST', '/instances/initech-leaving/billing/reactivate')
    ).json()) as InstanceBilling;

    expect(reactivated.cancelAtPeriodEnd).toBe(false);
    expect(reactivated.cancelRequestedAt).toBeUndefined();
    expect(reactivated.cancellationReason).toBeUndefined();
    expect(reactivated.status).toBe('ACTIVE');
  });

  it.each([
    [
      'a subscription that ended: it is subscribed again instead',
      '/instances/hooli-prod/billing/reactivate',
      409,
      'ReactivateSubscription.Canceled',
    ],
    [
      'one with no cancellation scheduled',
      '/instances/initech-prod/billing/reactivate',
      409,
      'ReactivateSubscription.NotScheduledForCancellation',
    ],
    [
      'an instance never subscribed',
      '/instances/initech-fresh/billing/reactivate',
      404,
      'ReactivateSubscription.NotFound',
    ],
  ])('refuses %s', async (_name, path, status, code) => {
    install();

    const response = await send('POST', path);

    expect(response.status).toBe(status);
    expect((await refusal(response)).code).toBe(code);
  });
});

describe('scheduling a plan change, as the mocks serve it', () => {
  it('moves the subscription to a plan at the end of its period, and replaces it with another', async () => {
    install();

    const scheduled = (await (
      await send('PUT', '/instances/initech-prod/billing/scheduled-change', {
        licensePriceId: PRO_V3_MONTHLY.id,
      })
    ).json()) as InstanceBilling;

    expect(scheduled.scheduledChange).toMatchObject({
      effectiveAt: '2026-10-15T00:00:00.000Z',
      scheduledAt: LIFECYCLE_NOW,
    });
    expect(scheduled.scheduledChange?.price.id).toBe(PRO_V3_MONTHLY.id);
    const replaced = (await (
      await send('PUT', '/instances/initech-moving/billing/scheduled-change', {
        licensePriceId: PRO_V2_ANNUAL_IN_ARREARS.id,
      })
    ).json()) as InstanceBilling;
    expect(replaced.scheduledChange?.price.id).toBe(PRO_V2_ANNUAL_IN_ARREARS.id);
  });

  it('applies the plan to the invoice the next boundary issues, which already carries the change', async () => {
    install();
    await send('PUT', '/instances/initech-prod/billing/scheduled-change', {
      licensePriceId: PRO_V3_MONTHLY.id,
    });

    const upcoming = (await (
      await send('GET', '/instances/initech-prod/billing/upcoming-invoice')
    ).json()) as { lines: Array<{ label: string }>; total: number };

    expect(upcoming.lines.map(({ label }) => label)).toEqual(['Pro v3, monthly']);
    expect(upcoming.total).toBe(3900);
  });

  it('drops the change, and refuses to drop one that is not there', async () => {
    install();

    const dropped = (await (
      await send('DELETE', '/instances/initech-moving/billing/scheduled-change')
    ).json()) as InstanceBilling;
    const none = await send(
      'DELETE',
      '/instances/initech-prod/billing/scheduled-change',
    );

    expect(dropped.scheduledChange).toBeUndefined();
    expect(none.status).toBe(409);
    expect((await refusal(none)).code).toBe('CancelPlanChange.NoPlanChangeScheduled');
  });

  it.each([
    ['a trial', 'initech-trial', PRO_V3_MONTHLY.id, 409, 'SchedulePlanChange.TrialInProgress'],
    ['a subscription that ended', 'hooli-prod', PRO_V3_MONTHLY.id, 409, 'SchedulePlanChange.NotActive'],
    ['a cancellation scheduled', 'initech-leaving', PRO_V3_MONTHLY.id, 409, 'SchedulePlanChange.CancellationScheduled'],
    ['the plan it is on', 'initech-prod', PRO_V2_MONTHLY.id, 422, 'SchedulePlanChange.SamePrice'],
    ['a plan in another currency', 'initech-prod', ENTERPRISE_V1_IN_EURO.id, 422, 'SchedulePlanChange.CurrencyMismatch'],
    ['a plan that was retired', 'initech-prod', PRO_V5_RETIRED.id, 422, 'SchedulePlanChange.PriceDeprecated'],
    ['a plan of a version that is a draft', 'initech-prod', 'price-pro-v4-monthly', 422, 'SchedulePlanChange.LicenseNotPublished'],
    ['a price that does not exist', 'initech-prod', 'price-nowhere', 404, 'SchedulePlanChange.PriceNotFound'],
    ['an instance never subscribed', 'initech-fresh', PRO_V3_MONTHLY.id, 404, 'SchedulePlanChange.NotFound'],
  ])('refuses %s', async (_name, slug, priceId, status, code) => {
    install();

    const response = await send('PUT', `/instances/${slug}/billing/scheduled-change`, {
      licensePriceId: priceId,
    });

    expect(response.status).toBe(status);
    expect((await refusal(response)).code).toBe(code);
  });
});

describe('changing the payment terms, as the mocks serve it', () => {
  it('sets the days of the contract, and says they are its own', async () => {
    install();

    const updated = (await (
      await send('PATCH', '/instances/initech-prod/billing', { daysUntilDue: 45 })
    ).json()) as InstanceBilling;

    expect(updated).toMatchObject({ daysUntilDue: 45, daysUntilDueOverride: 45 });
  });

  it('puts the terms of the organization back when the days are null, and leaves a member that is not sent', async () => {
    install();
    await send('PATCH', '/instances/initech-prod/billing', { daysUntilDue: 45 });

    const reset = (await (
      await send('PATCH', '/instances/initech-prod/billing', { daysUntilDue: null })
    ).json()) as InstanceBilling;

    expect(reset.daysUntilDue).toBe(30);
    expect(reset.daysUntilDueOverride).toBeUndefined();
    const untouched = (await (
      await send('PATCH', '/instances/initech-prod/billing', {})
    ).json()) as InstanceBilling;
    expect(untouched.daysUntilDue).toBe(30);
  });

  it.each([
    ['more than a year', 'initech-prod', { daysUntilDue: 366 }, 422, 'UpdateInstanceBilling.InvalidDaysUntilDue'],
    ['a subscription that ended', 'hooli-prod', { daysUntilDue: 10 }, 409, 'UpdateInstanceBilling.NotActive'],
    ['an instance never subscribed', 'initech-fresh', { daysUntilDue: 10 }, 404, 'UpdateInstanceBilling.NotFound'],
    ['collecting automatically on NoOp', 'initech-prod', { collectionMethod: 'CHARGE_AUTOMATICALLY' }, 422, 'UpdateInstanceBilling.CollectionMethodUnsupported'],
  ])('refuses %s', async (_name, slug, body, status, code) => {
    install();

    const response = await send('PATCH', `/instances/${slug}/billing`, body);

    expect(response.status).toBe(status);
    expect((await refusal(response)).code).toBe(code);
  });
});

describe('subscribing with a trial, as the mocks serve it', () => {
  it('starts in trial for the days asked, which end the period and bill nothing', async () => {
    install();

    const started = (await (
      await send('POST', '/instances/initech-fresh/billing', {
        basePriceId: PRO_V2_MONTHLY.id,
        trialDays: 10,
      })
    ).json()) as StartedSubscription;

    expect(started).toMatchObject({
      currentPeriodEnd: '2026-10-17T12:00:00.000Z',
      status: 'TRIAL',
      trialEndsAt: '2026-10-17T12:00:00.000Z',
    });
    expect(started.activationInvoice).toBeUndefined();
  });

  it('takes the trial the license carries when none is named, and none when it is zero', async () => {
    install();

    const carried = (await (
      await send('POST', '/instances/initech-fresh/billing', {
        basePriceId: PRO_V2_MONTHLY.id,
      })
    ).json()) as StartedSubscription;
    await send('POST', '/instances/initech-fresh/billing/cancel', {});
    const none = (await (
      await send('POST', '/instances/initech-fresh/billing', {
        basePriceId: PRO_V2_MONTHLY.id,
        trialDays: 0,
      })
    ).json()) as StartedSubscription;

    expect(carried.status).toBe('TRIAL');
    expect(none.status).toBe('ACTIVE');
    expect(none.trialEndsAt).toBeUndefined();
  });

  it('composes the activation the end of a trial will issue as the upcoming invoice', async () => {
    install();

    const upcoming = (await (
      await send('GET', '/instances/initech-trial/billing/upcoming-invoice')
    ).json()) as { boundaryAt: string; kind: string; total: number };

    expect(upcoming).toMatchObject({
      boundaryAt: '2026-10-13T00:00:00.000Z',
      kind: 'ACTIVATION',
      total: 2900,
    });
  });

  it('refuses a negative trial', async () => {
    install();

    const response = await send('POST', '/instances/initech-fresh/billing', {
      basePriceId: PRO_V2_MONTHLY.id,
      trialDays: -1,
    });

    expect(response.status).toBe(422);
    expect((await refusal(response)).code).toBe('SubscribeInstance.InvalidTrialDays');
  });
});

describe('the add-ons of an instance, as the mocks serve them', () => {
  it('lists the add-ons an instance holds, and detaches one, which stays readable with includeRemoved', async () => {
    install();

    const held = (await (
      await send('GET', '/instances/initech-seats/addons')
    ).json()) as InstanceAddon[];
    const detached = await send('DELETE', '/instances/initech-seats/addons/extra-seats-v1');
    const left = (await (
      await send('GET', '/instances/initech-seats/addons')
    ).json()) as InstanceAddon[];
    const history = (await (
      await send('GET', '/instances/initech-seats/addons?includeRemoved=true')
    ).json()) as InstanceAddon[];

    expect(held.map(({ addonSlug }) => addonSlug)).toEqual(['extra-seats-v1']);
    expect(detached.status).toBe(204);
    expect(left).toEqual([]);
    expect(history[0].removedAt).toBeDefined();
  });

  it('refuses to detach an add-on the instance does not hold', async () => {
    install();

    const response = await send('DELETE', '/instances/initech-prod/addons/extra-seats-v1');

    expect(response.status).toBe(404);
    expect((await refusal(response)).code).toBe('DetachInstanceAddon.NotFound');
  });
});
