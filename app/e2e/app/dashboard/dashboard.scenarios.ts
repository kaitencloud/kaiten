import { DashboardAppModel } from '../_support/model/dashboard-app-model';

export function createDashboardReadModel() {
  return new DashboardAppModel({
    customers: [
      {
        createdAt: '2025-01-10T10:00:00.000Z',
        id: 'cust-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
      },
      {
        createdAt: '2025-01-15T10:00:00.000Z',
        id: 'cust-2',
        name: 'Beta Industries',
        slug: 'beta-industries',
      },
    ],
    instances: [
      {
        createdAt: '2025-01-01T00:00:00.000Z',
        customerId: 'cust-1',
        endLicenseDate: '2026-01-01T00:00:00.000Z',
        id: 'inst-1',
        license: {
          id: 'lic-1',
          name: 'Enterprise',
          slug: 'enterprise',
          type: 'PAID',
        },
        licenseId: 'lic-1',
        name: 'Acme Prod',
        slug: 'acme-prod',
        startLicenseDate: '2025-01-01T00:00:00.000Z',
      },
      {
        createdAt: '2025-02-01T00:00:00.000Z',
        customerId: 'cust-2',
        endLicenseDate: '2026-02-01T00:00:00.000Z',
        id: 'inst-2',
        license: {
          id: 'lic-2',
          name: 'Starter',
          slug: 'starter',
          type: 'TRIAL',
        },
        licenseId: 'lic-2',
        name: 'Beta Staging',
        slug: 'beta-staging',
        startLicenseDate: '2025-02-01T00:00:00.000Z',
      },
    ],
    licenses: [
      {
        id: 'lic-1',
        name: 'Enterprise',
        slug: 'enterprise',
        type: 'PAID',
      },
      {
        id: 'lic-2',
        name: 'Starter',
        slug: 'starter',
        type: 'TRIAL',
      },
    ],
  });
}
