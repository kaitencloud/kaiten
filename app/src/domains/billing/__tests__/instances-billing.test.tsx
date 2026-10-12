import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import { sessionToken } from '@/test-fixtures/billing-test-support';
import { useInstancesBilling } from '../hooks';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

const SUBSCRIPTION = {
  cancelAtPeriodEnd: false,
  currentPeriodEnd: '2027-04-01T00:00:00.000Z',
  pastDueSince: null,
  providerKind: 'NOOP',
  status: 'ACTIVE',
  trialEndsAt: null,
};

const row = (slug: string, billing: object | null = SUBSCRIPTION) => ({
  billing,
  slug,
});

const page = (
  items: ReturnType<typeof row>[],
  nextCursor: string | null = null,
) => ({
  instances: { hasMore: nextCursor !== null, items, nextCursor },
});

/** Every request of the document, with the variables it was sent with. */
function answerBilling(
  respond: (variables: Record<string, unknown> | undefined) => unknown,
) {
  const requests: Array<Record<string, unknown> | undefined> = [];
  server.use(
    graphqlOperationHandler({
      GetInstancesBilling: (variables) => {
        requests.push(variables);
        return respond(variables);
      },
    }),
  );

  return requests;
}

const billingOn = () =>
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stack(),
    }),
  );

function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return renderHook(() => useInstancesBilling(), { wrapper });
}

beforeEach(() => {
  getAuthToken.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(['read:*']));
});

describe('useInstancesBilling', () => {
  it('sends nothing, and gives the lists no column, while billing is off', async () => {
    const requests = answerBilling(() => page([]));

    const { result } = render();
    // The capabilities have answered, billing is off, and nothing was asked for.
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.available).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it('sends nothing to a session that cannot read billing, though billing is on', async () => {
    billingOn();
    getAuthToken.mockResolvedValue(
      sessionToken(['read:instances', 'read:customers', 'read:licenses']),
    );
    const requests = answerBilling(() => page([row('acme-production')]));

    const { result } = render();
    await waitFor(() => expect(getAuthToken).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.available).toBe(false);
    expect(result.current.summaryOf('acme-production')).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('asks for a page at a time, with the variables of the list, and finds each instance by its slug', async () => {
    billingOn();
    const requests = answerBilling((variables) =>
      variables?.cursor === 'c1'
        ? page([row('beta-staging', null)])
        : page(
            [
              row('acme-production'),
              row('acme-staging', { ...SUBSCRIPTION, status: 'TRIAL' }),
            ],
            'c1',
          ),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.available).toBe(true));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    // The first page names no cursor at all, as the list does; undefined does not survive JSON.
    expect(requests).toEqual([{ limit: 200 }, { cursor: 'c1', limit: 200 }]);
    expect(result.current.available).toBe(true);
    expect(result.current.summaryOf('acme-production')?.status).toBe('ACTIVE');
    expect(result.current.summaryOf('acme-staging')?.status).toBe('TRIAL');
    // Never subscribed, and not in the answer at all: the same dash.
    expect(result.current.summaryOf('beta-staging')).toBeNull();
    expect(result.current.summaryOf('created-since')).toBeNull();
  });

  it('is pending, with the column already there, until the subscriptions have come', async () => {
    billingOn();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(/\/api\/graphql$/, async () => {
        await gate;
        return HttpResponse.json({ data: page([row('acme-production')]) });
      }),
    );

    const { result } = render();

    await waitFor(() =>
      expect(result.current).toMatchObject({ available: true, isPending: true }),
    );
    release();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.summaryOf('acme-production')?.status).toBe('ACTIVE');
  });

  it('gives a token that says nothing of its scopes the benefit of the doubt, and asks', async () => {
    billingOn();
    getAuthToken.mockResolvedValue(undefined);
    const requests = answerBilling(() => page([row('acme-production')]));

    const { result } = render();

    await waitFor(() => expect(result.current.available).toBe(true));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(requests).toHaveLength(1);
  });

  it('leaves the column out when the API refuses the document, and does not retry', async () => {
    billingOn();
    getAuthToken.mockResolvedValue(undefined);
    const requests = answerBilling(() => {
      throw Object.assign(new Error('refused'), { httpStatus: 502 });
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = render();

    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(requests).toHaveLength(1);
    expect(result.current.summaryOf('acme-production')).toBeNull();
  });

  it('reads a status it does not know without failing, and keeps what was sent', async () => {
    billingOn();
    answerBilling(() =>
      page([row('acme-production', { ...SUBSCRIPTION, status: 'PAUSED' })]),
    );

    const { result } = render();

    await waitFor(() => expect(result.current.available).toBe(true));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.summaryOf('acme-production')).toMatchObject({
      rawStatus: 'PAUSED',
      status: undefined,
    });
  });
});
