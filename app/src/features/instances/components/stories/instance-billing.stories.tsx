import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import {
  buildLicense,
  buildPrice,
  buildSubscription,
} from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { NotSubscribedCard } from '../instance-detail/tabs/billing/not-subscribed-card';
import { SubscribeAction } from '../instance-detail/tabs/billing/subscribe-action';
import { SubscriptionCard } from '../instance-detail/tabs/billing/subscription-card';

const meta = {
  title: 'Features/Instances/Billing',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const PUBLISHED = buildLicense({
  description: 'Enterprise production license',
  id: 'license-enterprise',
  lifecycleState: 'PUBLISHED',
  name: 'Enterprise',
  slug: 'enterprise',
  type: 'PAID',
  version: '2026.1',
});

const DRAFT = buildLicense({
  description: 'A version that is not on sale yet',
  id: 'license-preview',
  lifecycleState: 'DRAFT',
  name: 'Preview',
  slug: 'preview',
  type: 'PAID',
  version: '2027.1',
});

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Enterprise, monthly',
  id: 'price-enterprise-monthly',
  isDefault: true,
  unitAmountDecimal: '49900',
});

const ANNUAL_IN_ARREARS = buildPrice({
  billingPeriod: 'ANNUAL',
  billingTiming: 'ARREARS',
  displayLabel: 'Enterprise, annual',
  id: 'price-enterprise-annual',
  unitAmountDecimal: '499000',
});

const subscription = (
  overrides: Partial<Parameters<typeof buildSubscription>[0]> = {},
) =>
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

// How an instance is billed, the terms said to be the contract's: its status, who
// collects, the terms, the price it is pinned to, and its period in UTC.
export const ContractTerms: Story = {
  render: () => <SubscriptionCard subscription={subscription({ daysUntilDueOverride: 45 })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Payable within 45 days')).toBeVisible();
    await expect(canvas.getByText('This contract')).toBeVisible();
    await expect(canvas.getByText('Invoice sent to the customer')).toBeVisible();
    await expect(canvas.getByText('$499.00/month · In advance')).toBeVisible();
    await expect(canvas.getByText('Next boundary')).toBeVisible();
  },
};

// A subscription that names no terms takes the organization's, and says so.
export const OrganizationTerms: Story = {
  render: () => <SubscriptionCard subscription={subscription()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Payable within 30 days')).toBeVisible();
    await expect(canvas.getAllByText('Organization default')).toHaveLength(2);
  },
};

export const BilledInArrears: Story = {
  render: () => (
    <SubscriptionCard
      subscription={subscription({
        basePrice: ANNUAL_IN_ARREARS,
        currentPeriodEnd: '2028-02-15T00:00:00.000Z',
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('$4,990.00/year · In arrears'),
    ).toBeVisible();
  },
};

export const PastDue: Story = {
  render: () => (
    <SubscriptionCard
      subscription={subscription({
        pastDueSince: '2027-03-01T00:00:00.000Z',
        status: 'PAST_DUE',
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Past due since')).toBeVisible();
  },
};

// A subscription that ended keeps its row, says when and why, and offers to
// subscribe the instance again.
export const Ended: Story = {
  render: () => (
    <StorybookRouter>
      <SubscriptionCard
        actions={<SubscribeAction instanceSlug="acme-legacy" license={PUBLISHED} />}
        subscription={subscription({
          canceledAt: '2027-03-01T00:00:00.000Z',
          cancellationReason: 'The contract was not renewed',
          status: 'CANCELED',
        })}
      />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Canceled on')).toBeVisible();
    await expect(canvas.getByText('The contract was not renewed')).toBeVisible();
    await expect(canvas.queryByText('Next boundary')).toBeNull();
    await expect(canvas.getByRole('link', { name: 'Subscribe' })).toHaveAttribute(
      'href',
      '/customers/instances/acme-legacy/billing/subscribe',
    );
  },
};

// Not being subscribed is a state and not an error: the way to subscribe is a link
// to the dialog.
export const NotSubscribed: Story = {
  render: () => (
    <StorybookRouter>
      <NotSubscribedCard instanceSlug="beta-staging" license={PUBLISHED} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Not subscribed')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Subscribe' })).toBeVisible();
  },
};

// A version that is not on sale cannot be subscribed to: the button stays in the
// tab order, disabled, and the reason is the text that describes it.
export const NotOnSale: Story = {
  render: () => (
    <StorybookRouter>
      <NotSubscribedCard instanceSlug="beta-lab" license={DRAFT} />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: 'Subscribe' });

    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByTestId('subscribe-unavailable')).toHaveTextContent(
      'This instance runs Preview v2027.1 (Draft). Only a published license version can be subscribed to.',
    );
    await expect(canvas.queryByRole('link', { name: 'Subscribe' })).toBeNull();
  },
};
