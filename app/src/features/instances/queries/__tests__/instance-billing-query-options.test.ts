import { QueryClient } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleGetInstanceBilling,
  handleGetUpcomingInvoice,
  handleListInstanceInvoices,
  handleListLicensePrices,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`.
import '@/lib/api/bootstrap';
import {
  instanceBillingQueryOptions,
  instanceInvoicesQueryOptions,
  subscribablePricesQueryOptions,
  upcomingInvoiceQueryOptions,
} from '../instance-billing-query-options';

const problem = (status: number, code: string) =>
  HttpResponse.json({ code, detail: code, status }, { status });

describe('the subscription of an instance', () => {
  it('reads an instance that was never subscribed as no subscription, not as a failure', async () => {
    server.use(
      handleGetInstanceBilling(() => problem(404, 'GetInstanceBilling.NotFound')),
    );

    await expect(
      new QueryClient().fetchQuery(instanceBillingQueryOptions('gamma-production')),
    ).resolves.toBeNull();
  });

  it('reads any other refusal as one, for the tab to show', async () => {
    server.use(
      handleGetInstanceBilling(() => problem(403, 'Auth.MissingScope')),
    );

    await expect(
      new QueryClient().fetchQuery(instanceBillingQueryOptions('gamma-production')),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('does not retry a refusal, nor ask again by itself when the page mounts', () => {
    const options = instanceBillingQueryOptions('gamma-production');

    expect(options.retry).toBe(false);
    expect(options.retryOnMount).toBe(false);
  });

  it('keeps the key of the operation, so that the mutations of a subscription refresh it', () => {
    expect(JSON.stringify(instanceBillingQueryOptions('gamma-production').queryKey)).toContain(
      'getInstanceBilling',
    );
  });
});

describe('the upcoming invoice', () => {
  it.each([
    ['one that does not exist', 404, 'GetUpcomingInvoice.NotFound'],
    ['a subscription that is not active', 409, 'GetUpcomingInvoice.NotActive'],
  ])('is none for %s', async (_, status, code) => {
    server.use(handleGetUpcomingInvoice(() => problem(status, code)));

    await expect(
      new QueryClient().fetchQuery(upcomingInvoiceQueryOptions('globex-production')),
    ).resolves.toBeNull();
  });

  it('is a refusal to show when usage is no longer kept', async () => {
    server.use(
      handleGetUpcomingInvoice(() =>
        problem(422, 'GetUpcomingInvoice.OutsideRetention'),
      ),
    );

    await expect(
      new QueryClient().fetchQuery(upcomingInvoiceQueryOptions('globex-production')),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('the invoices of an instance', () => {
  it('are read a page at a time by cursor, the first with none', async () => {
    const asked: Array<{ params: Record<string, unknown>; url: URL }> = [];
    server.use(
      handleListInstanceInvoices(({ params, request }) => {
        const url = new URL(request.url);
        asked.push({ params, url });

        return HttpResponse.json(
          url.searchParams.has('cursor')
            ? { hasMore: false, items: [] }
            : { hasMore: true, items: [], nextCursor: 'next' },
        );
      }),
    );

    await new QueryClient().fetchInfiniteQuery({
      ...instanceInvoicesQueryOptions('globex-production'),
      pages: 2,
    });

    expect(asked).toHaveLength(2);
    expect(asked[0].params).toMatchObject({ instanceSlug: 'globex-production' });
    expect(asked[0].url.searchParams.has('cursor')).toBe(false);
    expect(asked[0].url.searchParams.get('limit')).toBe('50');
    expect(asked[1].url.searchParams.get('cursor')).toBe('next');
  });
});

describe('the prices an instance can be subscribed on', () => {
  it('asks the API for the active flat fees of the version', async () => {
    const asked: URL[] = [];
    server.use(
      handleListLicensePrices(({ request }) => {
        asked.push(new URL(request.url));

        return HttpResponse.json([]);
      }),
    );

    await new QueryClient().fetchQuery(subscribablePricesQueryOptions('starter-v2'));

    expect(asked[0].searchParams.get('billingModel')).toBe('FLAT_FEE');
    expect(asked[0].searchParams.get('status')).toBe('ACTIVE');
  });
});
