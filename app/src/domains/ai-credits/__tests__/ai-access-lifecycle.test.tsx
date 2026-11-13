import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { subscribeFeatureFlagRefresh } from '@/lib/feature-flags';
import { subscribeAiAccess } from '../ai-request-guard';
import { useAiAccess } from '../use-ai-access';

vi.mock('@/env', () => ({ default: { API_URL: 'http://api.test/api', PLATFORM_API_URL: '', PLATFORM_FLAGS_TOKEN: '' } }));
vi.mock('virtual:dev-tokens', () => ({ default: [] }));
vi.mock('@/lib/auth-token', () => ({ getAuthToken: async () => undefined }));
vi.mock('@/lib/session-identity', () => ({ getSessionIdentity: () => ({ userId: 'e2e', organizationId: 'e2e' }) }));
vi.mock('@/hooks/use-granted-scopes', () => ({ useGrantedScopes: () => ({ scopes: [], isPending: false }) }));
vi.hoisted(() => {
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');
  vi.stubEnv('VITE_LOCAL_AUTH', 'false');
});

afterEach(async () => {
  await OpenFeature.clearProviders();
  client.interceptors.request.clear();
  client.interceptors.error.clear();
  client.interceptors.response.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('does not replace an initializing provider and cancel healthy capability reads on StrictMode remount', async () => {
  let successfulCapabilities = 0;
  let evaluations = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    if (new URL(request.url).pathname === '/api/ai/capabilities') {
      // Keep the capability pending while both StrictMode mounts evaluate flags.
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (request.signal.aborted) throw new DOMException('aborted', 'AbortError');
      successfulCapabilities++;
      return new Response(JSON.stringify({ enabled: true }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    evaluations++;
    return new Response(JSON.stringify({ flags: [{ key: 'ai-credits', value: true, variant: 'on', reason: 'TARGETING_MATCH' }] }), { headers: { 'Content-Type': 'application/json' } });
  }));
  configureApiClient();
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
  const flagClient = OpenFeature.getClient('kaiten-ai-rollout');
  const providerError = vi.fn();
  flagClient.addHandler(ProviderEvents.Error, providerError);
  function Probe() {
    const access = useAiAccess();
    return <p>{access.available ? 'enabled' : 'disabled'}</p>;
  }
  function App() {
    useEffect(() => subscribeFeatureFlagRefresh(queryClient), []);
    useEffect(() => subscribeAiAccess(queryClient), []);
    return <QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>;
  }
  const mounted = render(<StrictMode><App /></StrictMode>);
  try {
    expect(await screen.findByText('enabled')).toBeInTheDocument();
    expect(successfulCapabilities).toBeGreaterThan(0);
    expect(evaluations).toBe(1);
    expect(providerError).not.toHaveBeenCalled();
  } finally {
    mounted.unmount();
    queryClient.clear();
    flagClient.removeHandler(ProviderEvents.Error, providerError);
  }
});
