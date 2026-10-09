import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { storyBillingProblem } from '@/test-fixtures/storybook-billing-fixtures';
import {
  BillingNotFound,
  BillingUnavailable,
  InstanceBillingBadge,
  InvoiceLineTypeBadge,
  InvoiceStatusBadge,
  MissingScopeBanner,
  Money,
  ProblemAlert,
  ServicePeriod,
  SubscriptionStatusBadge,
} from '..';
import {
  INVOICE_LINE_TYPES,
  INVOICE_STATUSES,
  type InstanceBillingSummary,
  SUBSCRIPTION_STATUSES,
  toInstanceBillingSummary,
} from '../../logic';
import type { BillingUnavailableReason } from '../../types';

const meta = {
  title: 'Domains/Billing',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const REASONS: BillingUnavailableReason[] = [
  'DEPLOYMENT_DISABLED',
  'NOT_ENTITLED',
  'MISSING_SCOPE',
  'FEATURE_UNAVAILABLE',
  'UNREACHABLE',
];

// What a link to a billing screen shows where billing is not: an explanation,
// one card per reason.
export const Unavailable: Story = {
  render: () => (
    <StorybookRouter>
      <div className="grid gap-4 md:grid-cols-2">
        {REASONS.map((reason) => (
          <BillingUnavailable
            key={reason}
            onRetry={() => {}}
            reason={reason}
            scope="read:billing"
          />
        ))}
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Billing is not enabled')).toBeVisible();
    await expect(canvas.getByText(/KAITEN_BILLING_ENABLED/)).toBeVisible();
    await expect(canvas.getByText('Billing is not part of your plan')).toBeVisible();
    await expect(canvas.getByText('You do not have access to billing')).toBeVisible();
    await expect(canvas.getByText('Not available in this version')).toBeVisible();
    await expect(canvas.getByText('Billing could not be reached')).toBeVisible();
    // Asking again is offered only where it may help.
    await expect(canvas.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  },
};

export const MissingScope: Story = {
  render: () => <MissingScopeBanner scope="write:billing" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('write:billing')).toBeVisible();
    await expect(canvas.getByText(/token template of your identity provider/)).toBeVisible();
  },
};

const onRetry = fn();

// The refusals of the API as a dialog shows them: the detail as written, a
// fallback with the code, a 503 that changed nothing, a missing scope.
export const Problems: Story = {
  render: () => (
    <div className="grid max-w-xl gap-4">
      <ProblemAlert
        error={storyBillingProblem(422, {
          code: 'SubscribeInstance.StartAtTooEarly',
          detail: 'startAt must be on or after 2027-02-01T10:00:00Z',
        })}
      />
      <ProblemAlert
        error={storyBillingProblem(422, { code: 'MarkInvoicePaid.InvalidStatus' })}
      />
      <ProblemAlert
        error={storyBillingProblem(503, {
          code: 'Billing.EntitlementCheckUnavailable',
          detail: 'The billing entitlement could not be checked',
        })}
        onRetry={onRetry}
      />
      <ProblemAlert
        error={storyBillingProblem(500, {
          detail: 'internal error',
          errorId: 'trace-42',
        })}
      />
      <ProblemAlert
        error={storyBillingProblem(403, {
          code: 'Auth.MissingScope',
          detail: 'missing required scope: write:billing',
        })}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('startAt must be on or after 2027-02-01T10:00:00Z'),
    ).toBeVisible();
    await expect(
      canvas.getByText('Something went wrong while talking to billing.'),
    ).toBeVisible();
    await expect(canvas.getByText('MarkInvoicePaid.InvalidStatus')).toBeVisible();
    await expect(canvas.getByText('Reference trace-42')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await expect(onRetry).toHaveBeenCalledTimes(1);
  },
};

// Statuses read in words, with a tone: held and overdue are derived from the
// invoice, never stored.
export const Statuses: Story = {
  render: () => (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {INVOICE_STATUSES.map((status) => (
          <InvoiceStatusBadge
            invoice={{ collectionMethod: 'SEND_INVOICE', status }}
            key={status}
          />
        ))}
        <InvoiceStatusBadge
          invoice={{
            collectionMethod: 'SEND_INVOICE',
            holdReason: 'LEDGER_SEQUENCE_GAP',
            status: 'DRAFT',
          }}
        />
        <InvoiceStatusBadge
          invoice={{
            collectionMethod: 'SEND_INVOICE',
            dueAt: '2027-03-01T00:00:00Z',
            status: 'MANUAL',
          }}
          now={Date.parse('2027-03-15T00:00:00Z')}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {SUBSCRIPTION_STATUSES.map((status) => (
          <SubscriptionStatusBadge
            key={status}
            subscription={{ cancelAtPeriodEnd: false, status }}
          />
        ))}
        <SubscriptionStatusBadge
          subscription={{ cancelAtPeriodEnd: true, status: 'ACTIVE' }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {INVOICE_LINE_TYPES.map((type) => (
          <InvoiceLineTypeBadge key={type} type={type} />
        ))}
        <InvoiceLineTypeBadge type="CREDIT" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Ready to bill')).toBeVisible();
    await expect(canvas.getByText('Held')).toBeVisible();
    await expect(canvas.getByText('Overdue')).toBeVisible();
    await expect(canvas.getByText('Written off')).toBeVisible();
    await expect(canvas.getByText('Cancels at period end')).toBeVisible();
    await expect(canvas.getByText('Overage')).toBeVisible();
    await expect(canvas.getByText('Other')).toBeVisible();
  },
};

const summaryOf = (
  status: string,
  cancelAtPeriodEnd = false,
): InstanceBillingSummary =>
  toInstanceBillingSummary({
    cancelAtPeriodEnd,
    currentPeriodEnd: '2027-04-01T00:00:00.000Z',
    pastDueSince: null,
    providerKind: 'NOOP',
    status,
    trialEndsAt: null,
  });

// The Billing column of the lists of instances: the state of the subscription
// read from the GraphQL API, whose enums are plain strings the console checks
// before it shows them. A dash for an instance nobody subscribed, and a state
// it does not know as it was written, neutral.
export const InstanceListBadges: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {SUBSCRIPTION_STATUSES.map((status) => (
        <InstanceBillingBadge key={status} summary={summaryOf(status)} />
      ))}
      <InstanceBillingBadge summary={summaryOf('ACTIVE', true)} />
      <InstanceBillingBadge summary={null} />
      <InstanceBillingBadge summary={summaryOf('PAUSED')} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Trial')).toBeVisible();
    await expect(canvas.getByText('Active')).toBeVisible();
    await expect(canvas.getByText('Past due')).toBeVisible();
    await expect(canvas.getByText('Canceled')).toBeVisible();
    await expect(canvas.getByText('Cancels at period end')).toBeVisible();
    await expect(canvas.getByText('Not subscribed')).toBeInTheDocument();
    // A state the console does not know is shown as the API wrote it.
    await expect(canvas.getByText('PAUSED')).toBeVisible();
  },
};

// Amounts come from the API in minor units and are written from the exponent of
// their currency; a period is UTC and half-open.
export const AmountsAndPeriods: Story = {
  render: () => (
    <div className="grid gap-2 text-sm">
      <Money amount={2900} currency="USD" />
      <Money amount={480000} currency="EUR" />
      <Money amount={5000} currency="JPY" />
      <Money amount={12345} currency="KWD" />
      <Money amount={-580} currency="USD" />
      <ServicePeriod
        from="2027-03-01T00:00:00.000Z"
        to="2027-04-01T00:00:00.000Z"
      />
      <ServicePeriod
        from="2027-02-01T10:00:00.000Z"
        to="2027-03-01T10:00:00.000Z"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('$29.00')).toBeVisible();
    await expect(canvas.getByText('€4,800.00')).toBeVisible();
    await expect(canvas.getByText('¥5,000')).toBeVisible();
    await expect(canvas.getByText('−$5.80')).toBeVisible();
    await expect(canvas.getAllByText(/\(UTC\)$/)).toHaveLength(2);
  },
};

// What a guarded billing route shows in place of its screen: the explanation
// where its guard closed the gate, and a missing page for a path that is none.
export const RouteNotFound: Story = {
  render: () => (
    <StorybookRouter>
      <div className="grid gap-4">
        <BillingNotFound
          data={{ available: false, reason: 'DEPLOYMENT_DISABLED' }}
        />
        <BillingNotFound />
      </div>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Billing is not enabled')).toBeVisible();
    await expect(canvas.getByText('Page not found')).toBeVisible();
  },
};
