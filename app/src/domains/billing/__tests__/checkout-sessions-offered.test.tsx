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
import { useCheckoutSessionsOffered } from '../hooks';
import { billingCapabilitiesQueryOptions } from '../queries';

// Whether the checkouts are offered: billing is on, the release ships the public surface
// and the scopes of the session cover the list of checkouts.

function offeredWith(
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
  const { result } = renderHook(() => useCheckoutSessionsOffered(), { wrapper });

  return result.current;
}

describe('useCheckoutSessionsOffered', () => {
  const stack = billingCapabilitiesProfiles.stack();

  it('is true where billing offers the checkouts', () => {
    expect(offeredWith(stack)).toBe(true);
  });

  it.each([
    ['billing is off', billingCapabilitiesProfiles.disabled('DEPLOYMENT_DISABLED')],
    ['the plan has no billing', billingCapabilitiesProfiles.disabled('NOT_ENTITLED')],
    ['the release does not ship the public surface', { ...stack, features: NO_BILLING_FEATURES }],
    ['the capabilities are still being read', undefined],
  ])('is false when %s', (_, capabilities) => {
    expect(offeredWith(capabilities)).toBe(false);
  });

  it('is false for a session whose scopes do not cover read:billing, and true for one that does', () => {
    expect(offeredWith(stack, ['read:customers'])).toBe(false);
    expect(offeredWith(stack, ['read:billing'])).toBe(true);
    expect(offeredWith(stack, ['read:*'])).toBe(true);
  });

  it('is false while the scopes of the token are being read', () => {
    expect(offeredWith(stack, 'unread')).toBe(false);
  });
});
