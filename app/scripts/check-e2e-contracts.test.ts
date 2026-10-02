import { describe, expect, it } from 'vite-plus/test';
import { unregisteredFactories } from './check-e2e-contracts';

describe('scenario inventory', () => {
  it('detects an omitted factory and a new pack, while allowing registered variants', () => {
    expect(unregisteredFactories({
      customers: { createCustomer: () => {}, createEmpty: () => {}, SEED: {} },
      dashboard: { createDashboard: () => {} },
    }, ['customers/createCustomer(1)', 'customers/createCustomer(2)'])).toEqual([
      'customers/createEmpty', 'dashboard/createDashboard',
    ]);
  });
});
