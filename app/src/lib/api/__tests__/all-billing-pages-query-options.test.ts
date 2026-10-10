import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  Addon,
  PublishableKey,
  Redemption,
  Voucher,
} from '@/api-client';
import {
  listAddonsOptions,
  listPublishableKeysQueryKey,
  listVoucherRedemptionsQueryKey,
  listVouchersQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  handleListAddons,
  handleListPublishableKeys,
  handleListVoucherRedemptions,
  handleListVouchers,
} from '@/api-client/msw.gen';
import {
  allAddonsOptions,
  allPublishableKeysOptions,
  allVoucherRedemptionsOptions,
  allVouchersOptions,
} from '../all-billing-pages-query-options';

const addon = (id: string) => ({ id }) as Addon;
const key = (id: string) => ({ id }) as PublishableKey;
const redemption = (id: string) => ({ id }) as Redemption;
const voucher = (id: string) => ({ id }) as Voucher;
const context = () => ({ signal: new AbortController().signal }) as never;

const queriesOf = (requests: Request[]) =>
  requests.map((request) =>
    Object.fromEntries(new URL(request.url).searchParams),
  );

describe('allAddonsOptions', () => {
  it('reads every page of the versions under the generated key, 200 rows a request', async () => {
    const requests: Request[] = [];
    server.use(
      handleListAddons(({ request }) => {
        requests.push(request);

        return HttpResponse.json(
          new URL(request.url).searchParams.get('cursor') === 'c1'
            ? { hasMore: false, items: [addon('v2')] }
            : { hasMore: true, items: [addon('v1')], nextCursor: 'c1' },
        );
      }),
    );

    const options = allAddonsOptions();

    expect(options.queryKey).toEqual(listAddonsOptions().queryKey);
    expect(await options.queryFn(context())).toEqual({
      hasMore: false,
      items: [addon('v1'), addon('v2')],
    });
    expect(queriesOf(requests)).toEqual([
      { limit: '200' },
      { cursor: 'c1', limit: '200' },
    ]);
  });

  it('refuses a page that says more follows and gives no cursor', async () => {
    server.use(
      handleListAddons({ body: { hasMore: true, items: [addon('v1')] } }),
    );

    await expect(allAddonsOptions().queryFn(context())).rejects.toThrow(
      'hasMore requires a cursor',
    );
  });
});

describe('allVouchersOptions', () => {
  it('reads every page of the vouchers under the generated key', async () => {
    const requests: Request[] = [];
    server.use(
      handleListVouchers(({ request }) => {
        requests.push(request);

        return HttpResponse.json(
          new URL(request.url).searchParams.get('cursor') === 'c1'
            ? { hasMore: false, items: [voucher('b')] }
            : { hasMore: true, items: [voucher('a')], nextCursor: 'c1' },
        );
      }),
    );

    const options = allVouchersOptions();

    expect(options.queryKey).toEqual(listVouchersQueryKey());
    expect(await options.queryFn(context())).toEqual({
      hasMore: false,
      items: [voucher('a'), voucher('b')],
    });
    expect(queriesOf(requests)).toEqual([
      { limit: '200' },
      { cursor: 'c1', limit: '200' },
    ]);
  });
});

describe('allVoucherRedemptionsOptions', () => {
  it('reads every page of one voucher, under the key of that voucher', async () => {
    const paths: string[] = [];
    server.use(
      handleListVoucherRedemptions(({ request }) => {
        const url = new URL(request.url);
        paths.push(`${url.pathname}?${url.searchParams.toString()}`);

        return HttpResponse.json(
          url.searchParams.get('cursor') === 'c1'
            ? { hasMore: false, items: [redemption('r2')] }
            : { hasMore: true, items: [redemption('r1')], nextCursor: 'c1' },
        );
      }),
    );

    const options = allVoucherRedemptionsOptions('voucher-1');

    expect(options.queryKey).toEqual(
      listVoucherRedemptionsQueryKey({ path: { voucherId: 'voucher-1' } }),
    );
    expect(await options.queryFn(context())).toEqual({
      hasMore: false,
      items: [redemption('r1'), redemption('r2')],
    });
    expect(paths).toEqual([
      '/api/vouchers/voucher-1/redemptions?limit=200',
      '/api/vouchers/voucher-1/redemptions?cursor=c1&limit=200',
    ]);
  });
});

describe('allPublishableKeysOptions', () => {
  it('keeps the list without the revoked keys under the key of the operation itself', () => {
    expect(allPublishableKeysOptions().queryKey).toEqual(
      listPublishableKeysQueryKey(),
    );
  });

  it('keeps the list with the revoked keys apart, under a key the operation key reaches', async () => {
    const withRevoked = allPublishableKeysOptions({ includeRevoked: true });

    expect(withRevoked.queryKey).not.toEqual(
      allPublishableKeysOptions().queryKey,
    );
    expect(withRevoked.queryKey).toEqual(
      listPublishableKeysQueryKey({ query: { includeRevoked: true } }),
    );

    const requests: Request[] = [];
    server.use(
      handleListPublishableKeys(({ request }) => {
        requests.push(request);

        return HttpResponse.json({ hasMore: false, items: [key('k1')] });
      }),
    );

    expect(await withRevoked.queryFn(context())).toEqual({
      hasMore: false,
      items: [key('k1')],
    });
    expect(queriesOf(requests)).toEqual([
      { includeRevoked: 'true', limit: '200' },
    ]);
  });

  it('refuses a body that is not a page', async () => {
    server.use(
      http.get('*/api/publishable-keys', () => HttpResponse.json([key('k1')])),
    );

    await expect(allPublishableKeysOptions().queryFn(context())).rejects.toThrow(
      'Invalid pagination response',
    );
  });
});
