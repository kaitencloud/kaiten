import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import type { BillingCapabilities } from '@/api-client';
import { billingCapabilitiesQueryOptions } from '@/domains/billing';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import {
  useResolvedBillingItems,
  useResolvedIntegrationsItems,
} from './side-nav-sections';

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

function billingPathsWith(capabilities: BillingCapabilities | undefined) {
  const queryClient = new QueryClient({
    // No capabilities seeded stays unread: the hook sees them loading.
    defaultOptions: { queries: { enabled: false } },
  });
  if (capabilities !== undefined) {
    queryClient.setQueryData(
      billingCapabilitiesQueryOptions.queryKey,
      capabilities,
    );
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useResolvedBillingItems(), { wrapper });
  return result.current.map((item) => item.path);
}

describe('useResolvedBillingItems', () => {
  it('lists the invoices and the handoff queue where billing is on', () => {
    expect(billingPathsWith(billingCapabilitiesProfiles.stack())).toEqual([
      '/billing/invoices',
      '/billing/handoff',
    ]);
  });

  it('adds the add-ons and the vouchers where the release ships them', () => {
    expect(billingPathsWith(billingCapabilitiesProfiles.full())).toEqual([
      '/billing/invoices',
      '/billing/handoff',
      '/addons',
      '/vouchers',
    ]);
  });

  it('lists an entry per part of the release, not a whole section at once', () => {
    const stack = billingCapabilitiesProfiles.stack();

    expect(
      billingPathsWith({ ...stack, features: { ...stack.features, vouchers: true } }),
    ).toEqual(['/billing/invoices', '/billing/handoff', '/vouchers']);
  });

  it.each(['DEPLOYMENT_DISABLED', 'NOT_ENTITLED'] as const)(
    'lists nothing where billing is off: %s',
    (reason) => {
      expect(billingPathsWith(billingCapabilitiesProfiles.disabled(reason))).toEqual(
        [],
      );
    },
  );

  it('lists nothing while the capabilities load', () => {
    expect(billingPathsWith(undefined)).toEqual([]);
  });
});
