import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { AiAvailability } from '../ai-availability';
import {
  AI_ACCESS_FRESHNESS_MS,
  aiAccessQueryOptions,
  readCurrentAiAccess,
} from '../ai-access';
import { subscribeAiAccess } from '../ai-request-guard';
import { useAiAccess } from '../use-ai-access';

const { capability, evaluate } = vi.hoisted(() => ({
  capability: vi.fn<() => Promise<boolean>>(),
  evaluate: vi.fn<() => Promise<boolean>>(),
}));
vi.mock('../ai-capabilities.api', () => ({ readAiCapability: capability }));
vi.mock('@/lib/feature-flags', () => ({
  aiCreditsFlagQueryOptions: { queryFn: evaluate },
}));
vi.mock('@/lib/session-identity', () => ({
  getSessionIdentity: () => ({ userId: 'fixture', organizationId: 'org' }),
}));

let dispose: (() => void) | undefined;
beforeEach(() => {
  capability.mockReset().mockResolvedValue(true);
  evaluate.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
});

const hang = () => new Promise<boolean>(() => {});
/** Lets timers and the query notifier (batched on a timeout) run. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

function RuleDraft() {
  return <input aria-label="Rate per request" defaultValue="" />;
}

function Probe() {
  const access = useAiAccess();
  return (
    <AiAvailability access={access}>
      <RuleDraft />
    </AiAvailability>
  );
}

/** Mounts an AI form behind the gate, with the request guard installed as in `main.tsx`. */
async function mountGrantedForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(grantedScopesQueryKey, null);
  dispose = subscribeAiAccess(queryClient);
  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  const field = await screen.findByRole('textbox', {
    name: 'Rate per request',
  });
  fireEvent.change(field, { target: { value: '0.25' } });
  return queryClient;
}

/** The state a background tab reaches once the 30 s snapshot has expired. */
function expireSnapshot(queryClient: QueryClient) {
  const { queryKey } = aiAccessQueryOptions();
  queryClient.setQueryData(
    queryKey,
    { enabled: true, expiresAt: performance.now() - 1 },
    { updatedAt: Date.now() - AI_ACCESS_FRESHNESS_MS - 1 },
  );
}

it('keeps a half-typed AI form mounted when the capability snapshot goes stale', async () => {
  const queryClient = await mountGrantedForm();
  // The refresh that would renew the snapshot is still pending.
  capability.mockImplementation(hang);
  await act(async () => {
    expireSnapshot(queryClient);
  });
  // Let the guard's expiry timer (0 ms once expired) run.
  await settle();
  expect(screen.getByRole('textbox', { name: 'Rate per request' })).toHaveValue(
    '0.25',
  );
  // Routes still refuse a stale positive: first access stays fail-closed.
  await act(async () => {
    capability.mockResolvedValueOnce(false);
    expect(await readCurrentAiAccess(queryClient)).toBe(false);
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'Rate per request' }),
    ).not.toBeInTheDocument(),
  );
});

it('keeps the form mounted while a refresh fails, then tears it down on an explicit false', async () => {
  const queryClient = await mountGrantedForm();
  capability.mockRejectedValue(new TypeError('Failed to fetch'));
  await act(async () => {
    await queryClient
      .fetchQuery({ ...aiAccessQueryOptions(), staleTime: 0 })
      .catch(() => undefined);
  });
  await settle();
  expect(screen.getByRole('textbox', { name: 'Rate per request' })).toHaveValue(
    '0.25',
  );
  capability.mockResolvedValue(false);
  await act(async () => {
    await queryClient.fetchQuery({ ...aiAccessQueryOptions(), staleTime: 0 });
  });
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'Rate per request' }),
    ).not.toBeInTheDocument(),
  );
});

it('never shows AI on a first access whose read fails', async () => {
  capability.mockRejectedValue(new TypeError('Failed to fetch'));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(grantedScopesQueryKey, null);
  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      queryClient.getQueryState(aiAccessQueryOptions().queryKey)?.fetchStatus,
    ).toBe('idle'),
  );
  expect(
    screen.queryByRole('textbox', { name: 'Rate per request' }),
  ).not.toBeInTheDocument();
});

it('does not abort an admitted AI write because the snapshot expired', async () => {
  const queryClient = new QueryClient();
  dispose = subscribeAiAccess(queryClient);
  queryClient.setQueryData(aiAccessQueryOptions().queryKey, {
    enabled: true,
    expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS,
  });
  let signal: AbortSignal | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    signal = (input as Request).signal;
    expireSnapshot(queryClient);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ slug: 'gpt-5' });
  });
  await client.request({
    baseUrl: 'http://api.test/api',
    url: '/models',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { slug: 'gpt-5' },
    bodySerializer: JSON.stringify,
    fetch,
    throwOnError: true,
  });
  expect(signal?.aborted).toBe(false);
});
