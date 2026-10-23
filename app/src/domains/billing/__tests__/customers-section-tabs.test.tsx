import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import type { BillingCapabilities } from '@/api-client';
import { type GrantedScopes, grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  billingCapabilitiesProfiles,
  NO_BILLING_FEATURES,
} from '../../../../e2e/app/_support/model/billing-capabilities';
import { useCustomersSectionTabs } from '../hooks';
import { billingCapabilitiesQueryOptions } from '../queries';

// The row of tabs above the pages of Customers: the customers and their instances always,
// the checkouts where billing is on, the release ships the public surface and the scopes
// of the session cover the list of checkouts.

function tabIdsWith(
  capabilities: BillingCapabilities | undefined,
  scopes: GrantedScopes | 'unread' = null,
) {
  const queryClient = new QueryClient({
    // What is not seeded stays unread: the hook sees it being read.
    defaultOptions: { queries: { enabled: false } },
  });
  if (capabilities !== undefined) {
    queryClient.setQueryData(billingCapabilitiesQueryOptions.queryKey, capabilities);
  }
  if (scopes !== 'unread') {
    queryClient.setQueryData(grantedScopesQueryKey, scopes);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCustomersSectionTabs(), { wrapper });

  return result.current;
}

const ids = (tabs: ReturnType<typeof tabIdsWith>) => tabs.map(({ id }) => id);

describe('useCustomersSectionTabs', () => {
  const stack = billingCapabilitiesProfiles.stack();

  it('lists the checkouts after the customers and the instances where billing offers them', () => {
    const tabs = tabIdsWith(stack);

    expect(ids(tabs)).toEqual(['customers', 'instances', 'checkout-sessions']);
    expect(tabs.map(({ to }) => to)).toEqual([
      '/customers',
      '/customers/instances',
      '/customers/checkout-sessions',
    ]);
  });

  it.each([
    ['billing is off', billingCapabilitiesProfiles.disabled('DEPLOYMENT_DISABLED')],
    ['the plan has no billing', billingCapabilitiesProfiles.disabled('NOT_ENTITLED')],
    ['the release does not ship the public surface', { ...stack, features: NO_BILLING_FEATURES }],
    ['the capabilities are still being read', undefined],
  ])('lists only the customers and the instances when %s', (_, capabilities) => {
    expect(ids(tabIdsWith(capabilities))).toEqual(['customers', 'instances']);
  });

  it('is left out for a session whose scopes do not cover read:billing, and offered to one that does', () => {
    expect(ids(tabIdsWith(stack, ['read:customers']))).toEqual(['customers', 'instances']);
    expect(ids(tabIdsWith(stack, ['read:billing']))).toContain('checkout-sessions');
    expect(ids(tabIdsWith(stack, ['read:*']))).toContain('checkout-sessions');
  });

  it('is left out while the scopes of the token are being read', () => {
    expect(ids(tabIdsWith(stack, 'unread'))).toEqual(['customers', 'instances']);
  });
});
