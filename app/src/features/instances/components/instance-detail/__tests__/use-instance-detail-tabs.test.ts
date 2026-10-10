import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useInstanceDetailTabs } from '../use-instance-detail-tabs';

const { billing, pathname } = vi.hoisted(() => ({
  billing: { enabled: true, mayRead: true },
  pathname: { current: '/customers/instances/globex-production' },
}));

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string;
  }) => select({ location: { pathname: pathname.current } }),
}));

// The scopes of the session are read from its token, which these tests have none of.
vi.mock('@/domains/billing', () => ({
  useBillingCapabilities: () => ({ isEnabled: billing.enabled }),
  useCanPerform: () => billing.mayRead,
}));

beforeEach(() => {
  billing.enabled = true;
  billing.mayRead = true;
});

function activeTabAt(path: string, slug = 'globex-production') {
  pathname.current = path;

  return renderHook(() => useInstanceDetailTabs(slug)).result.current
    .activeTab;
}

describe('useInstanceDetailTabs', () => {
  it('lists Billing between the entitlements and the audit trail where billing is on and may be read', () => {
    const { result } = renderHook(() =>
      useInstanceDetailTabs('globex-production'),
    );

    expect(result.current.items.map((item) => item.value)).toEqual([
      'overview',
      'entitlements',
      'billing',
      'audit-trail',
    ]);
  });

  it.each([
    ['billing is off', () => (billing.enabled = false)],
    ['the session may not read it', () => (billing.mayRead = false)],
  ])('has no Billing tab when %s', (_reason, apply) => {
    apply();

    const { result } = renderHook(() =>
      useInstanceDetailTabs('globex-production'),
    );

    expect(result.current.items.map((item) => item.value)).toEqual([
      'overview',
      'entitlements',
      'audit-trail',
    ]);
  });

  it.each([
    ['/customers/instances/globex-production', 'overview'],
    ['/customers/instances/globex-production/', 'overview'],
    ['/customers/instances/globex-production/entitlements', 'entitlements'],
    ['/customers/instances/globex-production/billing', 'billing'],
    // The dialog that subscribes is over the Billing tab, which stays the active one.
    ['/customers/instances/globex-production/billing/subscribe', 'billing'],
    ['/customers/instances/globex-production/audit-trail', 'audit-trail'],
  ])('is on the tab of %s', (path, tab) => {
    expect(activeTabAt(path)).toBe(tab);
  });

  // An instance can be named like a tab: its slug is not the tab.
  it.each([
    ['/customers/instances/billing', 'overview'],
    ['/customers/instances/billing/entitlements', 'entitlements'],
    ['/customers/instances/billing/billing', 'billing'],
    ['/customers/instances/entitlements', 'overview'],
    ['/customers/instances/audit-trail/audit-trail', 'audit-trail'],
  ])('reads the tab after the slug of the instance, at %s', (path, tab) => {
    expect(activeTabAt(path, path.split('/')[3])).toBe(tab);
  });
});
