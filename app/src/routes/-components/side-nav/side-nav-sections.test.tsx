import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
import { useResolvedIntegrationsItems } from './side-nav-sections';

function integrationsPathsWith(webhooksEnabled: boolean | undefined) {
  const queryClient = new QueryClient({
    // No flag seeded stays unread: the hook sees it being evaluated.
    defaultOptions: { queries: { enabled: false } },
  });
  if (webhooksEnabled !== undefined) {
    queryClient.setQueryData(
      webhooksFlagQueryOptions.queryKey,
      webhooksEnabled,
    );
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useResolvedIntegrationsItems(), {
    wrapper,
  });
  return result.current.map((item) => item.path);
}

describe('useResolvedIntegrationsItems', () => {
  it('lists webhooks where the webhooks flag is on', () => {
    expect(integrationsPathsWith(true)).toEqual([
      '/integrations/service-accounts',
      '/integrations/webhooks',
      '/integrations/connectors',
    ]);
  });

  it.each<[string, boolean | undefined]>([
    ['a self-hosted deployment (flag off)', false],
    ['a flag still being evaluated', undefined],
  ])('keeps only the ungated entries for %s', (_, enabled) => {
    expect(integrationsPathsWith(enabled)).toEqual([
      '/integrations/service-accounts',
      '/integrations/connectors',
    ]);
  });
});
