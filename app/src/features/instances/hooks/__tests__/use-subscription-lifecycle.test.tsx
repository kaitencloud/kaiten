import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleCancelPlanChange,
  handleCancelSubscription,
  handleReactivateSubscription,
  handleSchedulePlanChange,
  handleUpdateInstanceBilling,
} from '@/api-client/msw.gen';
import {
  getInstanceBillingQueryKey,
  getUpcomingInvoiceQueryKey,
  listInstanceInvoicesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { ApiError } from '@/lib/errors';
import {
  createTestClient,
  refusal,
} from '@/test-fixtures/billing-test-support';
import { buildSubscription } from '../../../../../e2e/app/_support/fixtures/build-subscription';
import { isOutOfDate, useSubscriptionLifecycle } from '../use-subscription-lifecycle';

const subscription = (overrides: Partial<Parameters<typeof buildSubscription>[0]> = {}) =>
  buildSubscription({
    anchorAt: '2026-08-28T00:00:00.000Z',
    instanceSlug: 'globex-production',
    ...overrides,
  });

const problem = (status: number, code: string) =>
  new ApiError({ data: { code, detail: 'refused', status }, status });

describe('a refusal that says the screen is out of date', () => {
  it.each([
    'CancelSubscription.NotActive',
    'ReactivateSubscription.Canceled',
    'ReactivateSubscription.NotScheduledForCancellation',
    'SchedulePlanChange.TrialInProgress',
    'SchedulePlanChange.CancellationScheduled',
  ])('is %s: the subscription is not as the screen showed it', (code) => {
    expect(isOutOfDate(problem(409, code))).toBe(true);
  });

  it('is not a period being closed, since nothing changed and a minute settles it', () => {
    expect(isOutOfDate(problem(409, 'CancelSubscription.BoundaryPending'))).toBe(false);
    expect(isOutOfDate(problem(409, 'SchedulePlanChange.BoundaryPending'))).toBe(false);
  });

  it.each([
    [422, 'CancelSubscription.InvalidReason'],
    [403, 'Auth.MissingScope'],
    [500, 'Internal'],
    [503, 'CancelSubscription.ProviderUnavailable'],
  ])('is not a %i: %s', (status, code) => {
    expect(isOutOfDate(problem(status, code))).toBe(false);
  });

  it('is not something that is no refusal at all', () => {
    expect(isOutOfDate(new Error('network down'))).toBe(false);
    expect(isOutOfDate(null)).toBe(false);
  });
});

describe('the changes to the life of a subscription', () => {
  const client = createTestClient();
  let invalidated: unknown[][];

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    invalidated = [];
    client.clear();
    vi.spyOn(client, 'invalidateQueries').mockImplementation(((filters: {
      queryKey?: unknown[];
    }) => {
      invalidated.push(filters.queryKey ?? []);

      return Promise.resolve();
    }) as typeof client.invalidateQueries);
  });

  const path = { instanceSlug: 'globex-production' };
  const refreshed = () =>
    [getInstanceBillingQueryKey({ path }), getUpcomingInvoiceQueryKey({ path }), listInstanceInvoicesQueryKey({ path })].every(
      (key) => invalidated.some((candidate) => JSON.stringify(candidate) === JSON.stringify(key)),
    );

  it.each([
    ['cancel', () => handleCancelSubscription({ body: subscription() as never }), (lifecycle: ReturnType<typeof useSubscriptionLifecycle>) => lifecycle.cancel.mutateAsync({ body: { mode: 'AT_PERIOD_END' }, path })],
    ['reactivate', () => handleReactivateSubscription({ body: subscription() }), (lifecycle: ReturnType<typeof useSubscriptionLifecycle>) => lifecycle.reactivate.mutateAsync({ path })],
    ['schedule a plan change', () => handleSchedulePlanChange({ body: subscription() }), (lifecycle: ReturnType<typeof useSubscriptionLifecycle>) => lifecycle.schedulePlanChange.mutateAsync({ body: { licensePriceId: 'price-1' }, path })],
    ['drop a plan change', () => handleCancelPlanChange({ body: subscription() }), (lifecycle: ReturnType<typeof useSubscriptionLifecycle>) => lifecycle.cancelPlanChange.mutateAsync({ path })],
    ['change the terms', () => handleUpdateInstanceBilling({ body: subscription() }), (lifecycle: ReturnType<typeof useSubscriptionLifecycle>) => lifecycle.updateTerms.mutateAsync({ body: { daysUntilDue: 45 }, path })],
  ])('refreshes the subscription, its upcoming invoice and its invoices when it is accepted: %s', async (_name, handler, run) => {
    server.use(handler());
    const { result } = renderHook(() => useSubscriptionLifecycle('globex-production'), { wrapper });

    await act(async () => {
      await run(result.current);
    });

    expect(refreshed()).toBe(true);
  });

  it('refreshes the tab as well when the API says the subscription is not as it was read', async () => {
    server.use(
      handleCancelSubscription(() =>
        refusal(409, { code: 'CancelSubscription.NotActive', detail: 'already canceled' }),
      ),
    );
    const { result } = renderHook(() => useSubscriptionLifecycle('globex-production'), { wrapper });

    await act(async () => {
      await result.current.cancel
        .mutateAsync({ body: { mode: 'IMMEDIATE' }, path })
        .catch(() => undefined);
    });

    expect(refreshed()).toBe(true);
  });

  it.each([
    ['a period being closed', 409, 'CancelSubscription.BoundaryPending'],
    ['a reason that is too long', 422, 'CancelSubscription.InvalidReason'],
    ['a scope that is missing', 403, 'Auth.MissingScope'],
  ])('refreshes nothing for %s: nothing changed', async (_name, status, code) => {
    server.use(handleCancelSubscription(() => refusal(status, { code, detail: 'refused' })));
    const { result } = renderHook(() => useSubscriptionLifecycle('globex-production'), { wrapper });

    await act(async () => {
      await result.current.cancel
        .mutateAsync({ body: { mode: 'IMMEDIATE' }, path })
        .catch(() => undefined);
    });

    expect(invalidated).toEqual([]);
  });

  it('is never optimistic: the subscription is not touched before the API answered', async () => {
    let answer: (() => void) | undefined;
    server.use(
      handleReactivateSubscription(
        () =>
          new Promise<Response>((resolve) => {
            answer = () => resolve(HttpResponse.json(subscription()));
          }),
      ),
    );
    client.setQueryData(getInstanceBillingQueryKey({ path }), subscription({ cancelAtPeriodEnd: true }));
    const { result } = renderHook(() => useSubscriptionLifecycle('globex-production'), { wrapper });

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.reactivate.mutateAsync({ path });
    });

    expect(
      (client.getQueryData(getInstanceBillingQueryKey({ path })) as { cancelAtPeriodEnd: boolean })
        .cancelAtPeriodEnd,
    ).toBe(true);
    await vi.waitFor(() => expect(answer).toBeDefined());
    await act(async () => {
      answer?.();
      await pending;
    });
  });
});
