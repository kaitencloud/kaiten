import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import type { BillingCapabilities } from '@/api-client';
import { billingCapabilitiesQueryOptions } from '@/domains/billing';
import { type GrantedScopes, grantedScopesQueryKey } from '@/lib/granted-scopes';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import {
  billingCapabilitiesProfiles,
  NO_BILLING_FEATURES,
} from '../../../../e2e/app/_support/model/billing-capabilities';
import {
  useResolvedBillingRoutes,
  useResolvedCatalogItems,
  useResolvedIntegrationsItems,
} from './side-nav-sections';

function integrationsPathsWith(
  webhooksServed: boolean | undefined,
  capabilities?: BillingCapabilities,
  // What the token of the session says: nothing about scopes by default, which the
  // console reads as every action being offered. `'unread'` leaves it unread.
  scopes: GrantedScopes | 'unread' = null,
) {
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
  if (capabilities !== undefined) {
    queryClient.setQueryData(
      billingCapabilitiesQueryOptions.queryKey,
      capabilities,
    );
  }
  if (scopes !== 'unread') {
    queryClient.setQueryData(grantedScopesQueryKey, scopes);
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

  describe('the publishable keys', () => {
    const keys = '/integrations/publishable-keys';

    it('are listed where billing is on, with the public surface shipped and enabled as the API serves it', () => {
      const capabilities = billingCapabilitiesProfiles.stack();

      expect(capabilities.features.publicSurface).toBe(true);
      expect(capabilities.publicSurface.enabled).toBe(true);
      expect(integrationsPathsWith(false, capabilities)).toContain(keys);
    });

    it('are listed where billing is on, whatever the capabilities say of the public surface', () => {
      const capabilities = {
        ...billingCapabilitiesProfiles.stack(),
        features: NO_BILLING_FEATURES,
        publicSurface: { enabled: false },
      };

      expect(capabilities.features.publicSurface).toBe(false);
      expect(integrationsPathsWith(false, capabilities)).toContain(keys);
    });

    it('are not listed where billing is off, or while the capabilities are read', () => {
      expect(
        integrationsPathsWith(
          false,
          billingCapabilitiesProfiles.disabled('DEPLOYMENT_DISABLED'),
        ),
      ).not.toContain(keys);
      expect(integrationsPathsWith(false, undefined)).not.toContain(keys);
    });

    it('are left to a session whose scopes cover read:publishable_keys', () => {
      const capabilities = billingCapabilitiesProfiles.stack();

      expect(
        integrationsPathsWith(false, capabilities, ['read:billing']),
      ).not.toContain(keys);
      expect(
        integrationsPathsWith(false, capabilities, [
          'read:billing',
          'read:publishable_keys',
        ]),
      ).toContain(keys);
      expect(
        integrationsPathsWith(false, capabilities, ['write:publishable_keys']),
      ).toContain(keys);
    });

    it('are not listed while the scopes of the token are being read', () => {
      expect(
        integrationsPathsWith(
          false,
          billingCapabilitiesProfiles.stack(),
          'unread',
        ),
      ).not.toContain(keys);
    });
  });
});

function seededClient(
  capabilities: BillingCapabilities | undefined,
  // What the token of the session says: nothing about scopes by default, which the
  // console reads as every action being offered. `'unread'` leaves it unread.
  scopes: GrantedScopes | 'unread',
) {
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
  if (scopes !== 'unread') {
    queryClient.setQueryData(grantedScopesQueryKey, scopes);
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function catalogPathsWith(
  capabilities: BillingCapabilities | undefined,
  scopes: GrantedScopes | 'unread' = null,
) {
  const { result } = renderHook(() => useResolvedCatalogItems(), {
    wrapper: seededClient(capabilities, scopes),
  });
  return result.current.map((item) => item.path);
}

function billingRoutePathsWith(
  capabilities: BillingCapabilities | undefined,
  scopes: GrantedScopes | 'unread' = null,
) {
  const { result } = renderHook(() => useResolvedBillingRoutes(), {
    wrapper: seededClient(capabilities, scopes),
  });
  return result.current.map((route) => route.path);
}

describe('useResolvedBillingRoutes', () => {
  it('lists the invoices as a first-level entry where billing is on', () => {
    expect(billingRoutePathsWith(billingCapabilitiesProfiles.stack())).toEqual([
      '/invoices',
    ]);
  });

  it('lists them whatever the release ships besides', () => {
    expect(billingRoutePathsWith(billingCapabilitiesProfiles.full())).toEqual([
      '/invoices',
    ]);
  });

  it.each(['DEPLOYMENT_DISABLED', 'NOT_ENTITLED'] as const)(
    'lists nothing where billing is off: %s',
    (reason) => {
      expect(
        billingRoutePathsWith(billingCapabilitiesProfiles.disabled(reason)),
      ).toEqual([]);
    },
  );

  it('lists nothing while the capabilities load', () => {
    expect(billingRoutePathsWith(undefined)).toEqual([]);
  });
});

describe('useResolvedCatalogItems', () => {
  const core = ['/catalog/licenses', '/catalog/entitlements'];

  it('lists the licenses and the entitlements where the release ships none of the billing parts', () => {
    expect(catalogPathsWith(billingCapabilitiesProfiles.stack())).toEqual(core);
  });

  it('lists the add-ons and the vouchers after them where the release ships them', () => {
    expect(catalogPathsWith(billingCapabilitiesProfiles.full())).toEqual([
      ...core,
      '/catalog/addons',
      '/catalog/vouchers',
    ]);
  });

  describe('the add-ons, for a session that may not read them', () => {
    const full = billingCapabilitiesProfiles.full();

    it('hides them from a session whose scopes do not cover read:addons', () => {
      expect(
        catalogPathsWith(full, ['read:billing', 'read:vouchers']),
      ).toEqual([...core, '/catalog/vouchers']);
    });

    it.each([
      ['read:addons', ['read:billing', 'read:addons']],
      ['write:addons, which covers it', ['read:billing', 'write:addons']],
      ['read:*', ['read:*']],
    ])('lists them for a session that holds %s', (_, scopes) => {
      expect(catalogPathsWith(full, scopes)).toContain('/catalog/addons');
    });

    it('does not list them while the scopes of the token are being read', () => {
      expect(catalogPathsWith(full, 'unread')).not.toContain('/catalog/addons');
    });
  });

  describe('the vouchers, for a session that may not read them', () => {
    const full = billingCapabilitiesProfiles.full();

    it('hides them from a session whose scopes do not cover read:vouchers', () => {
      expect(
        catalogPathsWith(full, ['read:billing', 'read:addons']),
      ).toEqual([...core, '/catalog/addons']);
    });

    it.each([
      ['read:vouchers', ['read:billing', 'read:vouchers']],
      ['write:vouchers, which covers it', ['read:billing', 'write:vouchers']],
      ['read:*', ['read:*']],
    ])('lists them for a session that holds %s', (_, scopes) => {
      expect(catalogPathsWith(full, scopes)).toContain('/catalog/vouchers');
    });

    it('does not list them while the scopes of the token are being read', () => {
      expect(catalogPathsWith(full, 'unread')).not.toContain(
        '/catalog/vouchers',
      );
    });
  });

  it('lists an entry per part of the release, not a whole section at once', () => {
    const stack = billingCapabilitiesProfiles.stack();

    expect(
      catalogPathsWith({
        ...stack,
        features: { ...stack.features, vouchers: true },
      }),
    ).toEqual([...core, '/catalog/vouchers']);
  });

  it.each(['DEPLOYMENT_DISABLED', 'NOT_ENTITLED'] as const)(
    'keeps the licenses and the entitlements where billing is off: %s',
    (reason) => {
      expect(
        catalogPathsWith(billingCapabilitiesProfiles.disabled(reason)),
      ).toEqual(core);
    },
  );

  it('keeps them while the capabilities load, and when they cannot be read', () => {
    expect(catalogPathsWith(undefined)).toEqual(core);
  });
});
