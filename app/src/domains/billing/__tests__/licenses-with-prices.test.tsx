import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { sessionToken } from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import { useLicensesWithPrices } from '../hooks';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

const PRICE = {
  billingModel: 'FLAT_FEE',
  billingPeriod: 'MONTHLY',
  billingTiming: 'ADVANCE',
  currency: 'USD',
  displayLabel: null,
  displayOrder: 0,
  id: 'price-pro-v3-monthly',
  isDefault: true,
  meteredEntitlement: null,
  saleUnitFactor: null,
  status: 'ACTIVE',
  unitAmountDecimal: '3900',
};

const license = (slug: string, prices: object[] = [PRICE]) => ({
  id: `license-${slug}`,
  lifecycleState: 'PUBLISHED',
  name: 'Pro',
  pricingType: 'PAID',
  prices,
  slug,
  version: '3',
  versionName: null,
});

const page = (
  items: ReturnType<typeof license>[],
  nextCursor: string | null = null,
) => ({
  licenses: { hasMore: nextCursor !== null, items, nextCursor },
});

function answerLicenses(
  respond: (variables: Record<string, unknown> | undefined) => unknown,
) {
  const requests: Array<Record<string, unknown> | undefined> = [];
  server.use(
    graphqlOperationHandler({
      GetLicensesWithPrices: (variables) => {
        requests.push(variables);
        return respond(variables);
      },
    }),
  );

  return requests;
}

const billingOn = () =>
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
  );

function render(options?: { enabled?: boolean }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(() => useLicensesWithPrices(options), { wrapper });
}

beforeEach(() => {
  getAuthToken.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(['read:*']));
});

describe('useLicensesWithPrices', () => {
  it('sends nothing while billing is off', async () => {
    const requests = answerLicenses(() => page([license('pro-v3')]));

    const { result } = render();
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(requests).toHaveLength(0);
  });

  it('sends nothing for a screen that holds it back, though billing is on', async () => {
    billingOn();
    const requests = answerLicenses(() => page([license('pro-v3')]));

    const { result } = render({ enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(requests).toHaveLength(0);
  });

  it('reads the versions and their prices a page at a time, never one read per version', async () => {
    billingOn();
    const requests = answerLicenses((variables) =>
      variables?.cursor === 'c1'
        ? page([license('pro-v5', [])])
        : page([license('pro-v3'), license('pro-v4')], 'c1'),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The first page names no cursor at all: undefined does not survive JSON.
    expect(requests).toEqual([{ limit: 200 }, { cursor: 'c1', limit: 200 }]);
    expect(result.current.data?.map((entry) => entry.slug)).toEqual([
      'pro-v3',
      'pro-v4',
      'pro-v5',
    ]);
    expect(result.current.data?.[0]?.prices).toEqual([
      expect.objectContaining({
        id: 'price-pro-v3-monthly',
        unitAmountDecimal: '3900',
      }),
    ]);
  });

  it('keeps a version whose price it cannot read, without that price', async () => {
    billingOn();
    answerLicenses(() =>
      page([license('pro-v3', [{ ...PRICE, billingModel: 'TIERED' }])]),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ prices: [], slug: 'pro-v3' });
  });

  it('fails with the refusal of the API, which the screen shows with a way to ask again', async () => {
    billingOn();
    getAuthToken.mockResolvedValue(sessionToken(['read:instances']));
    const requests = answerLicenses(() => page([]));

    const { result } = render();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(requests).toHaveLength(0);
    expect(result.current.error).toMatchObject({
      data: { code: 'Auth.MissingScope' },
      status: 403,
    });
  });
});
