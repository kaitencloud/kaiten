import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import type { InstanceBilling, InvoiceSummary } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListInstanceInvoices,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildLicense,
  buildPrice,
  buildSubscription,
  storyLicensePricesHandler,
} from '@/test-fixtures/storybook-billing-fixtures';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { SubscriptionNotices } from '../instance-detail/tabs/billing/notices/subscription-notices';
import { SubscriptionActions } from '../instance-detail/tabs/billing/subscription-actions';
import { SubscriptionCard } from '../instance-detail/tabs/billing/subscription-card';

// The day the stories are read: the days left of a trial and the days past due
// are counted from it, so they say the same on every run.
const NOW = Date.parse('2027-03-10T12:00:00.000Z');

const meta = {
  title: 'Features/Instances/BillingLifecycle',
  // Not a spy: the instrumentation of the stories reads the clock itself, and a spy
  // on it would observe its own reads for ever.
  beforeEach: () => {
    const now = Date.now;
    Date.now = () => NOW;

    return () => {
      Date.now = now;
    };
  },
  parameters: {
    layout: 'padded',
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
      ],
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});

const ANNUAL = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Enterprise, annual',
  id: 'price-enterprise-annual',
  unitAmountDecimal: '499000',
});

const ENTERPRISE_V4 = buildLicense({
  description: 'Enterprise',
  familyId: 'family-enterprise',
  id: 'license-enterprise-4',
  lifecycleState: 'PUBLISHED',
  name: 'Enterprise',
  slug: 'enterprise-v4',
  type: 'PAID',
  version: '4',
});

const subscription = (
  overrides: Partial<Parameters<typeof buildSubscription>[0]> = {},
): InstanceBilling =>
  buildSubscription({
    anchorAt: '2027-02-15T00:00:00.000Z',
    basePrice: MONTHLY,
    currentPeriodEnd: '2027-03-15T00:00:00.000Z',
    currentPeriodStart: '2027-02-15T00:00:00.000Z',
    customerName: 'Acme Corp',
    customerSlug: 'acme-corp',
    instanceName: 'Acme Production',
    instanceSlug: 'acme-production',
    ...overrides,
  });

/** The notices above the card of a subscription, and what may be done to it under the card. */
function Frame({ value }: { value: InstanceBilling }) {
  return (
    <StorybookRouter>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <SubscriptionNotices instanceSlug="acme-production" subscription={value} />
        <SubscriptionCard
          footer={<SubscriptionActions instanceSlug="acme-production" subscription={value} />}
          subscription={value}
        />
      </div>
    </StorybookRouter>
  );
}

// Nothing is billed during a trial, and the notice says so before anything else:
// when it ends, how long is left, when the first invoice is issued. The plan cannot
// change, and the button says why.
export const Trial: Story = {
  render: () => (
    <Frame
      value={subscription({
        currentPeriodEnd: '2027-03-20T00:00:00.000Z',
        status: 'TRIAL',
        trialEndsAt: '2027-03-20T00:00:00.000Z',
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('trial-notice');

    await expect(notice).toHaveTextContent('Trial until Mar 20, 2027 (UTC)');
    await expect(notice).toHaveTextContent('10 days left. Nothing is billed during the trial');
    await expect(notice).toHaveTextContent('The first invoice is issued on Mar 20, 2027 (UTC).');
    await expect(await canvas.findByRole('button', { name: 'Change plan' })).toBeDisabled();
    await expect(canvas.getByText('Trial ends')).toBeVisible();
  },
};

// A trial of a price billed in arrears: its first invoice is issued when the first
// period after the trial closes, not when the trial ends.
export const TrialBilledInArrears: Story = {
  render: () => (
    <Frame
      value={subscription({
        basePrice: ANNUAL,
        currentPeriodEnd: '2027-03-20T00:00:00.000Z',
        status: 'TRIAL',
        trialEndsAt: '2027-03-20T00:00:00.000Z',
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByTestId('trial-notice')).toHaveTextContent(
      'The first invoice is issued on Mar 20, 2028 (UTC).',
    );
  },
};

// The invoice that is unpaid past its due date, as the list of the invoices of the
// instance reads it.
const overdue: InvoiceSummary = {
  boundaryAt: '2027-02-05T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-02-05T00:00:00.000Z',
  currency: 'USD',
  customerName: 'Acme Corp',
  customerSlug: 'acme-corp',
  discountTotal: 0,
  dueAt: '2027-03-05T00:00:00.000Z',
  handoffStatus: 'PENDING',
  id: 'inv-overdue',
  instanceName: 'Acme Production',
  instanceSlug: 'acme-production',
  issuedAt: '2027-02-05T00:00:00.000Z',
  kind: 'RENEWAL',
  licenseSlug: 'enterprise',
  providerKind: 'NOOP',
  serviceFrom: '2027-01-05T00:00:00.000Z',
  serviceTo: '2027-02-05T00:00:00.000Z',
  status: 'MANUAL',
  subtotal: 49900,
  total: 49900,
  updatedAt: '2027-02-05T00:00:00.000Z',
};

// Past due: since when, which invoice, and that access is unchanged. No countdown:
// there is nothing to count down to in this version.
export const PastDue: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
        handleListInstanceInvoices(onePage([overdue])),
      ],
    },
  },
  render: () => (
    <Frame
      value={subscription({ pastDueSince: '2027-03-05T00:00:00.000Z', status: 'PAST_DUE' })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('past-due-notice');

    await expect(notice).toHaveTextContent('Past due since Mar 5, 2027 (UTC) (5 days)');
    await expect(await within(notice).findByRole('link', { name: 'View the invoice' })).toBeVisible();
    await expect(notice).toHaveTextContent('Access is unchanged');
  },
};

// A cancellation scheduled for the end of the period: when, why, what is still
// true, and the one click that takes it back. The plan cannot change meanwhile.
export const CancellationScheduled: Story = {
  render: () => (
    <Frame
      value={subscription({
        cancelAtPeriodEnd: true,
        cancelRequestedAt: '2027-03-08T10:00:00.000Z',
        cancellationReason: 'Moving to another vendor',
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('cancellation-notice');

    await expect(notice).toHaveTextContent('Cancels on Mar 15, 2027 (UTC)');
    await expect(notice).toHaveTextContent('Reason: Moving to another vendor');
    // What may be done is offered once the release is known to ship it.
    await expect(await within(notice).findByRole('button', { name: 'Reactivate' })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Change plan' })).toBeDisabled();
    await expect(canvas.getByText('Ends on')).toBeVisible();
  },
};

// A plan change waiting for the boundary: which plan, for how much, when, and the
// way to drop it. The license version the price belongs to is found among the
// versions on sale.
export const ScheduledChange: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
        storyLicensePricesHandler([ENTERPRISE_V4], {
          'enterprise-v4': [ANNUAL],
        }),
      ],
    },
  },
  render: () => (
    <Frame
      value={subscription({
        scheduledChange: {
          effectiveAt: '2027-03-15T00:00:00.000Z',
          price: ANNUAL,
          scheduledAt: '2027-03-01T00:00:00.000Z',
        },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByTestId('scheduled-change-notice');

    // The version the price belongs to is found once the licenses are read.
    await waitFor(() =>
      expect(notice).toHaveTextContent(
        'Changes to Enterprise v4 ($4,990.00/year) on Mar 15, 2027 (UTC)',
      ),
    );
    await expect(
      await within(notice).findByRole('button', { name: 'Cancel the change' }),
    ).toBeVisible();
  },
};

// A subscription that just runs has nothing above its card, and the three things
// that may be done to it under it.
export const Running: Story = {
  render: () => <Frame value={subscription()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('link', { name: 'Change plan' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Payment terms' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Cancel subscription' })).toBeVisible();
    await expect(canvas.queryByTestId('subscription-notices')).toBeNull();
  },
};
