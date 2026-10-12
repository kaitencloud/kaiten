import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { InstancesBilling } from '@/domains/billing';
import { CustomerInstancesCard } from '../customer-detail/customer-instances-card';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouter: () => ({
    buildLocation: ({ params }: { params: { instanceSlug: string } }) => ({
      pathname: `/customers/instances/${params.instanceSlug}`,
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const instance = (slug: string, name: string) =>
  ({
    customer: { slug: 'acme' },
    endLicenseDate: '2027-01-01T00:00:00.000Z',
    license: { name: 'Pro', type: 'PAID' },
    name,
    slug,
    startLicenseDate: '2026-01-01T00:00:00.000Z',
    status: 'HEALTHY',
  }) as never;

const instances = [
  instance('acme-production', 'Acme Production'),
  instance('acme-staging', 'Acme Staging'),
];

const billing = (overrides: Partial<InstancesBilling> = {}): InstancesBilling => ({
  available: true,
  isPending: false,
  summaryOf: (slug) =>
    slug === 'acme-production'
      ? {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: '2027-04-01T00:00:00.000Z',
          rawStatus: 'PAST_DUE',
          status: 'PAST_DUE',
        }
      : null,
  ...overrides,
});

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('CustomerInstancesCard', () => {
  it('has no Billing column when it is given no billing', () => {
    render(<CustomerInstancesCard customerSlug="acme" instances={instances} />);

    expect(
      screen.queryByText('Pages.Customers.Detail.instances.columns.billing'),
    ).not.toBeInTheDocument();
  });

  it('has none when billing cannot be read', () => {
    render(
      <CustomerInstancesCard
        billing={billing({ available: false })}
        customerSlug="acme"
        instances={instances}
      />,
    );

    expect(
      screen.queryByText('Pages.Customers.Detail.instances.columns.billing'),
    ).not.toBeInTheDocument();
  });

  it("shows the state of each instance's subscription, and a dash for one never billed", () => {
    render(
      <CustomerInstancesCard
        billing={billing()}
        customerSlug="acme"
        instances={instances}
      />,
    );

    expect(
      screen.getByText('Pages.Customers.Detail.instances.columns.billing'),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Acme Production')).getByText(
        'Features.Billing.SubscriptionStatus.PAST_DUE',
      ),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Acme Staging')).getByText(
        'Features.Billing.SubscriptionStatus.none',
      ),
    ).toBeInTheDocument();
  });
});
