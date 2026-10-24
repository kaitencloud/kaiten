import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { useCustomersSectionTabs } from '../use-customers-section-tabs';

const tabsWith = (checkoutsOffered: boolean) =>
  renderHook(() => useCustomersSectionTabs({ checkoutsOffered })).result
    .current;

describe('useCustomersSectionTabs', () => {
  it('lists the customers and the instances, and the checkouts after them where they are offered', () => {
    const tabs = tabsWith(true);

    expect(tabs.map(({ id }) => id)).toEqual([
      'customers',
      'instances',
      'checkout-sessions',
    ]);
    expect(tabs.map(({ to }) => to)).toEqual([
      '/customers',
      '/customers/instances',
      '/customers/checkout-sessions',
    ]);
  });

  it('lists only the customers and the instances where the checkouts are not offered', () => {
    expect(tabsWith(false).map(({ id }) => id)).toEqual([
      'customers',
      'instances',
    ]);
  });
});
