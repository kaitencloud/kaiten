import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { AiAvailability } from '../ai-availability';
import { useAiAccess } from '../use-ai-access';
import { aiAccessQueryOptions, AI_ACCESS_FRESHNESS_MS, requireAiAccess } from '../ai-access';
const { capability, evaluate, identity } = vi.hoisted(() => ({ capability: vi.fn<() => Promise<boolean>>(), evaluate: vi.fn<() => Promise<boolean>>(), identity: { userId: 'fixture', organizationId: 'organization' } }));
vi.mock('../ai-capabilities.api', () => ({ readAiCapability: capability }));
vi.mock('@/lib/feature-flags', () => ({ aiCreditsFlagQueryOptions: { queryFn: evaluate } }));
vi.mock('@/lib/session-identity', () => ({ getSessionIdentity: () => identity }));
beforeEach(() => { capability.mockReset().mockResolvedValue(false); evaluate.mockReset().mockResolvedValue(false); });
function renderAvailability(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const entered = vi.fn(); client.setQueryData(grantedScopesQueryKey, null);
  function Content() { entered(); return <p>AI operation mounted</p>; }
  function Probe() { const access = useAiAccess(); return <AiAvailability access={access}><Content /></AiAvailability>; }
  render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); return { entered, client };
}
it.each([[false, false], [false, true], [true, false], [true, true]])('requires capability=%s AND flag=%s', async (api, flag) => {
  capability.mockResolvedValue(api); evaluate.mockResolvedValue(flag);
  const { entered, client } = renderAvailability();
  await waitFor(() => expect(client.getQueryState(aiAccessQueryOptions().queryKey)?.fetchStatus).toBe('idle'));
  if (api && flag) expect(await screen.findByText('AI operation mounted')).toBeInTheDocument();
  else { expect(entered).not.toHaveBeenCalled(); expect(screen.queryByRole('status')).not.toBeInTheDocument(); expect(screen.queryByRole('button')).not.toBeInTheDocument(); }
});
it('omits pending access and starts no AI child reads', () => {
  capability.mockImplementation(() => new Promise(() => {})); evaluate.mockResolvedValue(true);
  const { entered } = renderAvailability(); expect(entered).not.toHaveBeenCalled(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it.each(['capability', 'flag'])('fails closed on %s errors even with stale true data', async (failed) => {
  const client = new QueryClient(); client.setQueryData(aiAccessQueryOptions().queryKey, { enabled: true, expiresAt: performance.now() - 1 }, { updatedAt: Date.now() - AI_ACCESS_FRESHNESS_MS - 1 });
  capability.mockResolvedValue(true); evaluate.mockResolvedValue(true); (failed === 'capability' ? capability : evaluate).mockRejectedValue(new Error('fixture outage'));
  const { entered } = renderAvailability(client);
  await waitFor(() => expect(client.getQueryData(aiAccessQueryOptions().queryKey)).toMatchObject({ enabled: false })); expect(entered).not.toHaveBeenCalled();
});
it('closes on invalidation and true to false, never retaining an invalidated positive', async () => {
  capability.mockResolvedValue(true); evaluate.mockResolvedValue(true); const { client } = renderAvailability(); await screen.findByText('AI operation mounted');
  let finish!: (value: boolean) => void; capability.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { void client.invalidateQueries({ queryKey: aiAccessQueryOptions().queryKey }); });
  await waitFor(() => expect(screen.queryByText('AI operation mounted')).not.toBeInTheDocument());
  await act(async () => { finish(false); }); await waitFor(() => expect(client.getQueryData(aiAccessQueryOptions().queryKey)).toMatchObject({ enabled: false }));
});
it('route guards recheck instead of trusting even a fresh cached true', async () => {
  const client = new QueryClient(); client.setQueryData(aiAccessQueryOptions().queryKey, { enabled: true, expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS }); capability.mockResolvedValue(false); evaluate.mockResolvedValue(true);
  await expect(requireAiAccess(client)).rejects.toMatchObject({ isNotFound: true }); expect(capability).toHaveBeenCalledOnce();
});

it.each(['capability', 'flag'])('a newly known false %s revokes immediately while the other read hangs', async (negative) => {
  capability.mockResolvedValue(true); evaluate.mockResolvedValue(true);
  const { client } = renderAvailability(); await screen.findByText('AI operation mounted');
  (negative === 'capability' ? capability : evaluate).mockResolvedValue(false);
  (negative === 'capability' ? evaluate : capability).mockImplementation(() => new Promise(() => {}));
  await act(async () => { await client.fetchQuery({ ...aiAccessQueryOptions(), staleTime: 0 }); });
  expect(client.getQueryData(aiAccessQueryOptions().queryKey)).toMatchObject({ enabled: false });
  await waitFor(() => expect(screen.queryByText('AI operation mounted')).not.toBeInTheDocument());
});
it('bounds the snapshot by the older observation, not completion of a delayed aggregate', async () => {
  let finish!: (value: boolean) => void;
  let now = 100_000; const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  capability.mockResolvedValue(true); evaluate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const client = new QueryClient();
  const pending = client.fetchQuery(aiAccessQueryOptions());
  await Promise.resolve(); await Promise.resolve();
  now += AI_ACCESS_FRESHNESS_MS + 1; finish(true);
  expect(await pending).toMatchObject({ enabled: false });
  clock.mockRestore();
});
