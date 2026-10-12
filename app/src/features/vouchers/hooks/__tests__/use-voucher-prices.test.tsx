import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import {
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { useVoucherPrices } from '../use-voucher-prices';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

useBillingTexts();

const price = (id: string, overrides: object = {}) => ({
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency: 'USD',
  displayLabel: null,
  displayOrder: 0,
  id,
  isDefault: false,
  meteredEntitlement: null,
  saleUnitFactor: null,
  status: 'ACTIVE',
  unitAmountDecimal: '2900',
  ...overrides,
});

const license = (
  id: string,
  version: string,
  prices: object[] = [],
  lifecycleState = 'PUBLISHED',
) => ({ id, lifecycleState, name: 'Pro', prices, version });

const addon = (
  id: string,
  prices: object[] = [],
  lifecycleState = 'PUBLISHED',
) => ({
  id,
  lifecycleState,
  name: 'Extra seats',
  prices,
  versionName: 'Version - 1',
});

type Variables = Record<string, unknown> | undefined;

const list = <T,>(items: T[], nextCursor: string | null = null) => ({
  hasMore: nextCursor !== null,
  items,
  nextCursor,
});

/** Answers the document, and keeps what every request of it carried. */
function answerCatalog(respond: (variables: Variables) => object) {
  const requests: Variables[] = [];
  server.use(
    graphqlOperationHandler({
      GetCatalogPrices: (variables) => {
        requests.push(variables);

        return respond(variables);
      },
    }),
  );

  return requests;
}

/** Every request to the REST price reads the document replaces. */
function watchRestPriceReads() {
  const reads: string[] = [];
  server.use(
    http.get(/\/(licenses|addons)\/[^/]+\/prices$/, ({ request }) => {
      reads.push(request.url);

      return HttpResponse.json([]);
    }),
  );

  return reads;
}

function render(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(() => useVoucherPrices({ enabled }), { wrapper });
}

beforeEach(() => {
  getAuthToken.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(['read:*']));
});

describe('useVoucherPrices', () => {
  it('reads the prices of every license version and every add-on version in one request', async () => {
    const restReads = watchRestPriceReads();
    const requests = answerCatalog(() => ({
      addons: list([
        addon('addon-seats-1', [price('price-seats', { unitAmountDecimal: '500' })]),
        addon('addon-seats-2', [price('price-seats-2')]),
      ]),
      licenses: list([
        license('license-pro-1', '1', [price('price-pro-1')]),
        license('license-pro-2', '2', [price('price-pro-2')]),
        license('license-pro-3', '3'),
      ]),
    }));

    const { result } = render();

    await waitFor(() => expect(result.current.isPending).toBe(false));
    // Five versions, three of them priced: one request, and none of the five reads of
    // `/licenses/{slug}/prices` or `/addons/{slug}/prices` that this document replaced.
    expect(requests).toEqual([
      { limit: 200, withAddons: true, withLicenses: true },
    ]);
    expect(restReads).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(
      result.current.options.map((option) => [
        option.id,
        option.owner,
        option.ownerKind,
      ]),
    ).toEqual([
      ['price-pro-1', 'Pro v1', 'LICENSE'],
      ['price-pro-2', 'Pro v2', 'LICENSE'],
      ['price-seats', 'Extra seats · Version - 1', 'ADDON'],
      ['price-seats-2', 'Extra seats · Version - 1', 'ADDON'],
    ]);
  });

  it('sends nothing until the screen asks for the prices', async () => {
    const requests = answerCatalog(() => ({ addons: list([]), licenses: list([]) }));

    const { result } = render(false);
    await waitFor(() => expect(getAuthToken).not.toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(requests).toEqual([]);
    expect(result.current.isPending).toBe(false);
    expect(result.current.options).toEqual([]);
    expect(result.current.names).toEqual({});
  });

  it('lists a deprecated price and says so, and names a version that is not on sale', async () => {
    answerCatalog(() => ({
      addons: list([
        addon(
          'addon-seats-1',
          [price('price-seats', { status: 'DEPRECATED' })],
          'DRAFT',
        ),
      ]),
      licenses: list([
        license(
          'license-pro-1',
          '1',
          [
            price('price-pro-active'),
            price('price-pro-old', {
              displayLabel: 'Legacy plan',
              status: 'DEPRECATED',
            }),
          ],
          'ARCHIVED',
        ),
      ]),
    }));

    const { result } = render();

    await waitFor(() => expect(result.current.options).toHaveLength(3));
    expect(
      result.current.options.map((option) => [
        option.id,
        option.owner,
        option.label,
        option.deprecated,
        option.amount,
      ]),
    ).toEqual([
      ['price-pro-active', 'Pro v1 (archived)', 'Flat fee', false, '$29.00/month'],
      ['price-pro-old', 'Pro v1 (archived)', 'Legacy plan', true, '$29.00/month'],
      [
        'price-seats',
        'Extra seats · Version - 1 (draft)',
        'Flat fee',
        true,
        '$29.00/month',
      ],
    ]);
    expect(result.current.names).toEqual({
      'price-pro-active': 'Pro v1 (archived) · Flat fee',
      'price-pro-old': 'Pro v1 (archived) · Legacy plan',
      'price-seats': 'Extra seats · Version - 1 (draft) · Flat fee',
    });
  });

  it('writes a metered price by the unit it is sold in, and leaves out a price it cannot read', async () => {
    answerCatalog(() => ({
      addons: list([]),
      licenses: list([
        license('license-pro-1', '1', [
          price('price-tokens', {
            billingModel: 'USAGE_BASED',
            billingPeriod: null,
            billingTiming: 'ARREARS',
            meteredEntitlement: 'tokens',
            saleUnitFactor: '1000',
            unitAmountDecimal: '15',
          }),
          price('price-odd', { billingModel: 'TIERED' }),
        ]),
      ]),
    }));

    const { result } = render();

    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(result.current.options[0]).toMatchObject({
      amount: '$0.15 per 1,000 tokens',
      id: 'price-tokens',
      label: 'tokens',
    });
  });

  it('follows the cursor of a list that is longer than a page, and asks for that list alone', async () => {
    const requests = answerCatalog((variables) => {
      if (variables?.licensesCursor === 'licenses-2') {
        return { licenses: list([license('license-pro-3', '3', [price('p3')])]) };
      }

      return {
        addons: list([addon('addon-seats-1', [price('p-seats')])]),
        licenses: list(
          [license('license-pro-1', '1', [price('p1')])],
          'licenses-2',
        ),
      };
    });

    const { result } = render();

    await waitFor(() => expect(result.current.options).toHaveLength(3));
    // The second request leaves the add-ons out: they were read to their end.
    expect(requests).toEqual([
      { limit: 200, withAddons: true, withLicenses: true },
      {
        licensesCursor: 'licenses-2',
        limit: 200,
        withAddons: false,
        withLicenses: true,
      },
    ]);
    expect(result.current.options.map((option) => option.id)).toEqual([
      'p1',
      'p3',
      'p-seats',
    ]);
  });

  it('shows the refusal of the API for a session that cannot read both lists, and asks again on request', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:licenses']));
    const requests = answerCatalog(() => ({
      addons: list([]),
      licenses: list([license('license-pro-1', '1', [price('p1')])]),
    }));

    const { result } = render();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    // The API refuses the whole document and names the first scope it lacks: the
    // licenses a session may read are not served beside it.
    expect(result.current.error).toMatchObject({
      data: { code: 'Auth.MissingScope', detail: 'missing required scope: read:addons' },
      status: 403,
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.options).toEqual([]);
    expect(requests).toEqual([]);

    getAuthToken.mockResolvedValue(sessionToken(['read:licenses', 'read:addons']));
    result.current.refetch();

    await waitFor(() => expect(result.current.options).toHaveLength(1));
    expect(result.current.error).toBeNull();
    expect(requests).toHaveLength(1);
  });
});
