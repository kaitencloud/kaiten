import { QueryClient } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement, InvoiceSummary, QueuedInvoice } from '@/api-client';
import {
  listEntitlementsOptions,
  listHandoffOptions,
  listHandoffQueryKey,
  listInstanceInvoicesQueryKey,
  listInvoicesOptions,
  listInvoicesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  handleListEntitlements,
  handleListHandoff,
  handleListInstanceInvoices,
  handleListInvoices,
} from '@/api-client/msw.gen';
import {
  allEntitlementsOptions,
  allHandoffOptions,
  allInstanceInvoicesOptions,
  allInvoicesOptions,
} from '../all-pages-query-options';

const entitlement = (id: string) => ({ id }) as Entitlement;
const invoice = (id: string) => ({ id }) as InvoiceSummary;
const queued = (id: string) => ({ id }) as QueuedInvoice;
const signal = () => ({ signal: new AbortController().signal }) as never;

describe('allEntitlementsOptions', () => {
  it('reads every page under the generated first-page query key', async () => {
    const pageQueries: Array<Record<string, string>> = [];
    server.use(
      handleListEntitlements(({ request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        pageQueries.push(query);

        return HttpResponse.json(
          query.cursor === 'c1'
            ? { hasMore: false, items: [entitlement('e2')] }
            : { hasMore: true, items: [entitlement('e1')], nextCursor: 'c1' },
        );
      }),
    );

    const options = allEntitlementsOptions();

    // Invalidations and cache updates target the generated key.
    expect(options.queryKey).toEqual(listEntitlementsOptions().queryKey);

    const result = await options.queryFn?.({
      signal: new AbortController().signal,
    } as never);

    expect(result).toEqual({
      hasMore: false,
      items: [entitlement('e1'), entitlement('e2')],
    });
    expect(pageQueries).toEqual([
      { limit: '200' },
      { cursor: 'c1', limit: '200' },
    ]);
  });

  it.each([
    '<!doctype html>', null, {}, { items: [] },
    { hasMore: true, items: [] },
    { hasMore: false, items: 'bad' },
  ])('rejects an invalid successful API response: %j', async (body) => {
    server.use(http.get('*/api/entitlements', () => HttpResponse.json(body)));
    const options = allEntitlementsOptions();
    await expect(options.queryFn({ signal: new AbortController().signal } as never)).rejects.toThrow('Invalid pagination response');
  });
});

describe('allInvoicesOptions', () => {
  it('reads every page of the invoices of a scope, repeating the scope on each request, under the generated key', async () => {
    const asked: Array<Record<string, string>> = [];
    server.use(
      handleListInvoices(({ request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        asked.push(query);

        return HttpResponse.json(
          query.cursor === 'c1'
            ? { hasMore: false, items: [invoice('i2')] }
            : { hasMore: true, items: [invoice('i1')], nextCursor: 'c1' },
        );
      }),
    );
    const options = allInvoicesOptions({ customerSlug: 'acme' });

    expect(options.queryKey).toEqual(
      listInvoicesOptions({ query: { customerSlug: 'acme' } }).queryKey,
    );
    await expect(options.queryFn(signal())).resolves.toEqual({
      hasMore: false,
      items: [invoice('i1'), invoice('i2')],
    });
    expect(asked).toEqual([
      { customerSlug: 'acme', limit: '200' },
      { cursor: 'c1', customerSlug: 'acme', limit: '200' },
    ]);
  });

  it('is reached by the invalidation of every list of invoices, whatever its scope', () => {
    const client = new QueryClient();
    const empty = { hasMore: false, items: [] };
    client.setQueryData(allInvoicesOptions().queryKey, empty);
    client.setQueryData(allInvoicesOptions({ customerSlug: 'acme' }).queryKey, empty);
    client.setQueryData(allInvoicesOptions({ instanceSlug: 'acme-prod' }).queryKey, empty);

    expect(
      client.getQueryCache().findAll({ queryKey: listInvoicesQueryKey() }),
    ).toHaveLength(3);
  });

  it('keeps two scopes apart', () => {
    expect(allInvoicesOptions({ customerSlug: 'acme' }).queryKey).not.toEqual(
      allInvoicesOptions({ customerSlug: 'globex' }).queryKey,
    );
  });
});

describe('allInstanceInvoicesOptions', () => {
  it('reads every page of the invoices of an instance, under the key the subscription invalidates', async () => {
    const asked: Array<{ params: Record<string, unknown>; query: Record<string, string> }> = [];
    server.use(
      handleListInstanceInvoices(({ params, request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        asked.push({ params, query });

        return HttpResponse.json(
          query.cursor === 'c1'
            ? { hasMore: false, items: [invoice('i2')] }
            : { hasMore: true, items: [invoice('i1')], nextCursor: 'c1' },
        );
      }),
    );
    const options = allInstanceInvoicesOptions('acme-prod');

    expect(options.queryKey).toEqual(
      listInstanceInvoicesQueryKey({ path: { instanceSlug: 'acme-prod' } }),
    );
    await expect(options.queryFn(signal())).resolves.toEqual({
      hasMore: false,
      items: [invoice('i1'), invoice('i2')],
    });
    expect(asked.map(({ params }) => params.instanceSlug)).toEqual([
      'acme-prod',
      'acme-prod',
    ]);
    expect(asked.map(({ query }) => query)).toEqual([
      { limit: '200' },
      { cursor: 'c1', limit: '200' },
    ]);
  });
});

describe('allHandoffOptions', () => {
  it('reads every page of one part of the queue, repeating it on each request, under the generated key', async () => {
    const asked: Array<Record<string, string>> = [];
    server.use(
      handleListHandoff(({ request }) => {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        asked.push(query);

        return HttpResponse.json(
          query.cursor === 'c1'
            ? { hasMore: false, items: [queued('q2')] }
            : { hasMore: true, items: [queued('q1')], nextCursor: 'c1' },
        );
      }),
    );
    const options = allHandoffOptions({ status: 'ACKNOWLEDGED' });

    expect(options.queryKey).toEqual(
      listHandoffOptions({ query: { status: 'ACKNOWLEDGED' } }).queryKey,
    );
    await expect(options.queryFn(signal())).resolves.toEqual({
      hasMore: false,
      items: [queued('q1'), queued('q2')],
    });
    expect(asked).toEqual([
      { limit: '200', status: 'ACKNOWLEDGED' },
      { cursor: 'c1', limit: '200', status: 'ACKNOWLEDGED' },
    ]);
  });

  it('is reached by the invalidation of the queue, whichever part of it was read', () => {
    const client = new QueryClient();
    const empty = { hasMore: false, items: [] };
    client.setQueryData(allHandoffOptions({ status: 'PENDING' }).queryKey, empty);
    client.setQueryData(allHandoffOptions({ status: 'ACKNOWLEDGED' }).queryKey, empty);

    expect(
      client.getQueryCache().findAll({ queryKey: listHandoffQueryKey() }),
    ).toHaveLength(2);
  });

  it('keeps the two parts of the queue apart', () => {
    expect(allHandoffOptions({ status: 'PENDING' }).queryKey).not.toEqual(
      allHandoffOptions({ status: 'ACKNOWLEDGED' }).queryKey,
    );
  });
});
