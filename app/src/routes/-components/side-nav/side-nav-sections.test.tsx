import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import { useResolvedIntegrationsItems } from './side-nav-sections';

function integrationsPathsWith(webhooksServed: boolean | undefined) {
  const queryClient = new QueryClient({
    // No answer seeded stays unread: the hook sees it being read.
    defaultOptions: { queries: { enabled: false } },
  });
  if (webhooksServed !== undefined) {
    queryClient.setQueryData(
      webhooksServedQueryOptions.queryKey,
      webhooksServed,
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
  it('lists webhooks where they are served', () => {
    expect(integrationsPathsWith(true)).toEqual([
      '/integrations/service-accounts',
      '/integrations/webhooks',
      '/integrations/connectors',
    ]);
  });

  it.each<[string, boolean | undefined]>([
    ['a self-hosted deployment, or a licence without webhooks', false],
    ['an answer still being read', undefined],
  ])('keeps only the other entries for %s', (_, served) => {
    expect(integrationsPathsWith(served)).toEqual([
      '/integrations/service-accounts',
      '/integrations/connectors',
    ]);
  });
});
