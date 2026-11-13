import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import type { BillingCapabilities } from '@/api-client';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import { useBillingFeatureAccess } from '../hooks';
import { billingCapabilitiesQueryOptions } from '../queries';

function access(capabilities: BillingCapabilities | undefined, scopes: string[] | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  if (capabilities) {
    client.setQueryData(billingCapabilitiesQueryOptions.queryKey, capabilities);
  }
  if (scopes) {
    client.setQueryData(grantedScopesQueryKey, scopes);
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useBillingFeatureAccess('addons.create', 'addons'), { wrapper }).result.current;
}

describe('expansion access', () => {
  it('needs both the feature grant and the operation scopes', () => {
    expect(access(billingCapabilitiesProfiles.full(), ['write:addons'])).toEqual({ allowed: true, isPending: false });
    expect(access(billingCapabilitiesProfiles.full(), ['read:addons'])).toEqual({ allowed: false, isPending: false });
    expect(access(billingCapabilitiesProfiles.stack(), ['write:addons'])).toEqual({ allowed: false, isPending: false });
    expect(access(billingCapabilitiesProfiles.disabled(), ['write:addons'])).toEqual({ allowed: false, isPending: false });
  });

  it('fails closed on unknown feature checks and while either answer loads', () => {
    expect(access({ ...billingCapabilitiesProfiles.stack(), featureCheckUnavailable: ['addons'] }, ['write:addons'])).toEqual({ allowed: false, isPending: false });
    expect(access(undefined, ['write:addons'])).toEqual({ allowed: false, isPending: true });
    expect(access(billingCapabilitiesProfiles.full(), undefined)).toEqual({ allowed: false, isPending: true });
  });
});
