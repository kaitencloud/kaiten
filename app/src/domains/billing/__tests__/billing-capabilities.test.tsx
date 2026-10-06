import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { renderHook, waitFor } from '@testing-library/react';
import { delay } from 'msw';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { logger } from '@/lib/logger';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import {
  BILLING_CAPABILITIES_TIMEOUT_MS,
  billingCapabilitiesQueryOptions,
  readBillingGate,
  requireBillingCapability,
  useBillingCapabilities,
} from '../queries';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const newClient = () =>
  new QueryClient({
    // The app's own defaults, but for the retry the options must turn off.
    defaultOptions: { queries: { retry: 3, retryDelay: 0, staleTime: 30_000 } },
  });

const problem = (status: number, code: string | undefined, detail: string) =>
  HttpResponse.json(
    { code, detail, status, title: 'Error' },
    { headers: { 'Content-Type': 'application/problem+json' }, status },
  );

const answer = (capabilities = billingCapabilitiesProfiles.stack()) =>
  server.use(handleGetBillingCapabilities({ body: capabilities }));

const refuse = (status: number, code?: string, detail = 'refused') =>
  server.use(handleGetBillingCapabilities(() => problem(status, code, detail)));

function render(client = newClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useBillingCapabilities(), { wrapper }) };
}

describe('useBillingCapabilities', () => {
  it('keeps billing hidden while the capabilities load', () => {
    answer();
    const { result } = render();

    expect(result.current).toMatchObject({ isEnabled: false, isPending: true });
    expect(result.current.has()).toBe(false);
  });

  it('turns billing on when the capabilities say so, and reads which parts ship', async () => {
    answer(billingCapabilitiesProfiles.full());
    const { result } = render();

    await waitFor(() => expect(result.current.isEnabled).toBe(true));

    expect(result.current.isPending).toBe(false);
    expect(result.current.unavailableReason).toBeUndefined();
    expect(result.current.has()).toBe(true);
    expect(result.current.has('addons')).toBe(true);
    expect(result.current.capabilities?.providers).toHaveLength(2);
  });

  it('offers only what this release ships', async () => {
    answer(billingCapabilitiesProfiles.stack());
    const { result } = render();

    await waitFor(() => expect(result.current.isEnabled).toBe(true));

    expect(result.current.has('addons')).toBe(false);
    expect(result.current.has('vouchers')).toBe(false);
  });

  it.each(['DEPLOYMENT_DISABLED', 'NOT_ENTITLED'] as const)(
    'stays hidden, with its reason, when billing is off: %s',
    async (reason) => {
      answer(billingCapabilitiesProfiles.disabled(reason));
      const { result } = render();

      await waitFor(() => expect(result.current.isPending).toBe(false));

      expect(result.current).toMatchObject({
        isEnabled: false,
        unavailableReason: reason,
      });
      expect(result.current.has('addons')).toBe(false);
    },
  );

  it.each([
    ['a 403', 403, 'Auth.MissingScope', 'MISSING_SCOPE'],
    ['a 404', 404, undefined, 'FEATURE_UNAVAILABLE'],
    ['a 503', 503, 'Billing.EntitlementCheckUnavailable', 'UNREACHABLE'],
  ] as const)('fails closed on %s, asking once and warning once', async (_, status, code, reason) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    let requests = 0;
    server.use(
      handleGetBillingCapabilities(() => {
        requests += 1;
        return problem(status, code, 'refused');
      }),
    );
    const { result } = render();

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current).toMatchObject({
      isEnabled: false,
      unavailableReason: reason,
    });
    // Neither the client's three retries nor a second warning.
    expect(requests).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout when billing never answers', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    server.use(
      handleGetBillingCapabilities(async () => {
        await delay('infinite');
        return HttpResponse.json(billingCapabilitiesProfiles.stack());
      }),
    );
    const { result } = render();

    await vi.advanceTimersByTimeAsync(BILLING_CAPABILITIES_TIMEOUT_MS - 1);
    expect(result.current.isPending).toBe(true);
    expect(result.current.isEnabled).toBe(false);

    // The timeout, then the turn the query client takes to tell the hook.
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(10);
    vi.useRealTimers();
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current).toMatchObject({
      isEnabled: false,
      unavailableReason: 'UNREACHABLE',
    });
  });
});

describe('readBillingGate', () => {
  it('opens the gate when billing is on', async () => {
    answer();

    await expect(readBillingGate(newClient())).resolves.toEqual({
      available: true,
    });
  });

  it('closes it for a part of billing the release does not ship', async () => {
    answer();

    await expect(readBillingGate(newClient(), 'addons')).resolves.toEqual({
      available: false,
      reason: 'FEATURE_UNAVAILABLE',
    });
  });

  it('opens it for a part the release ships', async () => {
    answer(billingCapabilitiesProfiles.full());

    await expect(readBillingGate(newClient(), 'vouchers')).resolves.toEqual({
      available: true,
    });
  });

  it('closes it with the reason billing is off', async () => {
    answer(billingCapabilitiesProfiles.disabled('NOT_ENTITLED'));

    await expect(readBillingGate(newClient())).resolves.toMatchObject({
      available: false,
      reason: 'NOT_ENTITLED',
    });
  });

  it('closes it, never throws, and names the scope when the capabilities are refused', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    refuse(403, 'Auth.MissingScope', 'missing required scope: read:billing');

    await expect(readBillingGate(newClient())).resolves.toEqual({
      available: false,
      reason: 'MISSING_SCOPE',
      scope: 'read:billing',
    });
  });

  it('reads the capabilities again after a failure, which is not kept as an answer', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const client = newClient();
    refuse(503, 'Billing.EntitlementCheckUnavailable');

    await expect(readBillingGate(client)).resolves.toMatchObject({
      available: false,
      reason: 'UNREACHABLE',
    });

    answer();
    await expect(readBillingGate(client)).resolves.toEqual({
      available: true,
    });
  });

  it('shares its answer with the navigation, through one cache entry', async () => {
    let requests = 0;
    server.use(
      handleGetBillingCapabilities(() => {
        requests += 1;
        return HttpResponse.json(billingCapabilitiesProfiles.stack());
      }),
    );
    const client = newClient();

    await readBillingGate(client);
    await readBillingGate(client, 'lifecycle');

    expect(requests).toBe(1);
    expect(client.getQueryData(billingCapabilitiesQueryOptions.queryKey)).toMatchObject({
      enabled: true,
    });
  });
});

// What the failure of a guard carries: the not-found the router renders in place
// of the route, with the closed gate for the explanation.
async function closedGateOf(promise: Promise<unknown>) {
  const failure = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(isNotFound(failure)).toBe(true);
  return (failure as { data?: unknown }).data;
}

describe('requireBillingCapability', () => {
  it('lets the route load when billing is on', async () => {
    answer();

    await expect(requireBillingCapability(newClient())).resolves.toBeUndefined();
  });

  it('lets the route load when the release ships the part it needs', async () => {
    answer(billingCapabilitiesProfiles.full());

    await expect(
      requireBillingCapability(newClient(), 'vouchers'),
    ).resolves.toBeUndefined();
  });

  it('throws a not-found that carries the reason billing is off', async () => {
    answer(billingCapabilitiesProfiles.disabled('NOT_ENTITLED'));

    expect(await closedGateOf(requireBillingCapability(newClient()))).toMatchObject({
      available: false,
      reason: 'NOT_ENTITLED',
    });
  });

  it('throws for a part of billing the release does not ship', async () => {
    answer();

    expect(
      await closedGateOf(requireBillingCapability(newClient(), 'addons')),
    ).toMatchObject({ available: false, reason: 'FEATURE_UNAVAILABLE' });
  });

  it('throws, naming the scope, when the capabilities are refused', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    refuse(403, 'Auth.MissingScope', 'missing required scope: read:billing');

    expect(await closedGateOf(requireBillingCapability(newClient()))).toEqual({
      available: false,
      reason: 'MISSING_SCOPE',
      scope: 'read:billing',
    });
  });

  it('reads the capabilities again on the next load after a failure', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const client = newClient();
    refuse(503, 'Billing.EntitlementCheckUnavailable');

    expect(await closedGateOf(requireBillingCapability(client))).toMatchObject({
      reason: 'UNREACHABLE',
    });

    answer();
    await expect(requireBillingCapability(client)).resolves.toBeUndefined();
  });
});
