import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { InstanceBillingBadge, InstanceBillingCell } from '../components';
import {
  NO_INSTANCES_BILLING,
  type InstancesBilling,
} from '../hooks/use-instances-billing';
import type { InstanceBillingSummary } from '../logic';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';

useBillingTexts();

const summary = (
  overrides: Partial<InstanceBillingSummary> = {},
): InstanceBillingSummary => ({
  cancelAtPeriodEnd: false,
  currentPeriodEnd: '2027-04-01T00:00:00.000Z',
  providerKind: 'NOOP',
  rawStatus: 'ACTIVE',
  status: 'ACTIVE',
  ...overrides,
});

describe('InstanceBillingBadge', () => {
  it.each([
    ['TRIAL', 'Trial'],
    ['ACTIVE', 'Active'],
    ['PAST_DUE', 'Past due'],
    ['CANCELED', 'Canceled'],
  ] as const)('reads %s as %s', (status, label) => {
    render(<InstanceBillingBadge summary={summary({ rawStatus: status, status })} />);

    expect(screen.getByText(label)).toHaveAttribute('data-status', status);
  });

  it('reads a cancellation scheduled for the end of the period as what is about to happen', () => {
    render(<InstanceBillingBadge summary={summary({ cancelAtPeriodEnd: true })} />);

    expect(screen.getByText('Cancels at period end')).toHaveAttribute('data-status', 'ACTIVE');
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('does not read an ended subscription as a scheduled end', () => {
    render(
      <InstanceBillingBadge
        summary={summary({ cancelAtPeriodEnd: true, rawStatus: 'CANCELED', status: 'CANCELED' })}
      />,
    );

    expect(screen.getByText('Canceled')).toBeInTheDocument();
  });

  it('shows a dash, and says it to a screen reader, for an instance that was never subscribed', () => {
    render(<InstanceBillingBadge summary={null} />);

    expect(screen.getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Not subscribed')).toHaveClass('sr-only');
  });

  it('shows a status the console does not know as it was written, neutral, and does not fail', () => {
    render(<InstanceBillingBadge summary={summary({ rawStatus: 'PAUSED', status: undefined })} />);

    expect(screen.getByText('PAUSED')).toHaveAttribute('data-status', 'PAUSED');
  });
});

describe('InstanceBillingCell', () => {
  const available = (overrides: Partial<InstancesBilling>): InstancesBilling => ({
    available: true,
    isPending: false,
    summaryOf: () => null,
    ...overrides,
  });

  it('holds the place of the badge while the subscriptions are read', () => {
    render(
      <InstanceBillingCell
        billing={available({ isPending: true })}
        instanceSlug="acme-production"
      />,
    );

    expect(screen.getByTestId('billing-cell-pending')).toHaveAttribute('aria-busy', 'true');
  });

  it('asks for the subscription of its own instance by slug', () => {
    const billing = available({
      summaryOf: (slug) =>
        slug === 'acme-production' ? summary({ rawStatus: 'TRIAL', status: 'TRIAL' }) : null,
    });
    render(
      <>
        <InstanceBillingCell billing={billing} instanceSlug="acme-production" />
        <InstanceBillingCell billing={billing} instanceSlug="acme-staging" />
      </>,
    );

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Not subscribed')).toBeInTheDocument();
  });

  it('knows no subscription when billing cannot be read', () => {
    expect(NO_INSTANCES_BILLING.available).toBe(false);
    expect(NO_INSTANCES_BILLING.summaryOf('acme-production')).toBeNull();
  });
});
