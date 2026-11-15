import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { acme, older, ruleOf, viewOf } from '../__tests__/receipt-world';
import { ReceiptBody, ReceiptHeadline } from '../receipt/receipt-body';
import type { ReceiptView } from '../receipt/receipt-view';

/** The receipt's content as the sheet shows it, without the sheet and its links. */
function Receipt({
  view,
  licenceName,
}: {
  view: ReceiptView;
  licenceName?: string;
}) {
  return (
    <div className="max-w-xl space-y-4 rounded-xl border bg-background p-4">
      <ReceiptHeadline view={view} />
      <ReceiptBody view={view} licenceName={licenceName} />
    </div>
  );
}

const meta = {
  title: 'Features/Instances/AiUsage/ChargeReceipt',
  component: Receipt,
  parameters: { layout: 'padded' },
  args: { view: viewOf(acme(3), { creditValue: '0.01' }) },
} satisfies Meta<typeof Receipt>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 003, the normal case: the rates applied at commit are read from the row, the
 * rule has not changed since, and the integration reported a dearer vendor cost
 * than the catalogue computes.
 */
export const FromSnapshot: Story = {
  args: { licenceName: 'Enterprise 2026' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/The rule has not changed since/)).toBeInTheDocument();
    await expect(canvas.getByText('1.38 credits')).toBeInTheDocument();
    await expect(canvas.getByText('Enterprise 2026')).toBeInTheDocument();
    await expect(canvas.getByText('+$0.00145')).toBeInTheDocument();
    await expect(canvasElement.querySelector('pre')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Raw record' }));
    await expect(canvasElement.querySelector('pre')).not.toBeNull();
  },
};

/** 004: the rule was edited after the commit; today's values sit beside the applied ones. */
export const RuleEditedSince: Story = {
  args: { view: viewOf(acme(4)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Rule edited since').length).toBeGreaterThan(0);
    await expect(canvas.getByText('now 0.00025')).toBeInTheDocument();
  },
};

/** 017: refunded in part; the charge stays, the refunds are listed. */
export const PartlyRefunded: Story = {
  args: { view: viewOf(acme(17)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Refunded 30.00 of 78.50 credits.')).toBeInTheDocument();
    await expect(canvas.getByText(/by Ada Lovelace/)).toBeInTheDocument();
  },
};

/** 020: a warning stored with the commit, said in plain words. */
export const WithWarning: Story = {
  args: { view: viewOf(acme(20)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/The charge on this receipt is exact/),
    ).toBeInTheDocument();
  },
};

/** The row names a licence version that was deleted since: its id alone. */
export const LicenceDeleted: Story = {
  args: {
    view: viewOf((({ licenseSlug: _slug, ...row }) => row)(acme(3))),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('this licence version no longer exists'),
    ).toBeInTheDocument();
  },
};

/** 019: a release that closed no reservation. */
export const ReleaseWithoutReservation: Story = {
  args: { view: viewOf(acme(19)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/which held no reservation/),
    ).toBeInTheDocument();
  },
};

/** 014, an older row with no snapshot: recomputed from today's rule, which matches. */
export const OlderRowRecomputed: Story = {
  args: { view: viewOf(acme(14)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Recomputed from the rule as it is now/)).toBeInTheDocument();
    await expect(canvas.getByText('Any model · exact request type')).toBeInTheDocument();
  },
};

/** 016: computed 0.128, raised to the 0.5 minimum. */
export const RaisedToMinimum: Story = {
  args: { view: viewOf(acme(16)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('raised to 0.50')).toBeInTheDocument();
  },
};

/** An older row whose rule was edited after the commit is not re-derived. */
export const CannotReconstruct: Story = {
  args: {
    view: viewOf(older(3), {
      rule: { ...ruleOf(older(3))!, updatedAt: '2026-11-11T09:39:00.000Z' },
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/not re-derived here/),
    ).toBeInTheDocument();
  },
};

/** 011: no rule prices the model. */
export const NoRule: Story = {
  args: { view: viewOf(acme(11)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/no wildcard covers it/),
    ).toBeInTheDocument();
  },
};

/** 008: the model is not in the catalogue. */
export const UnknownModel: Story = {
  args: { view: viewOf(acme(8)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/neither a model slug nor an external ID/),
    ).toBeInTheDocument();
  },
};

/** 009: the model is archived. */
export const ArchivedModel: Story = {
  args: { view: viewOf(acme(9)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/is archived/)).toBeInTheDocument();
  },
};

/** 007: a provider error the rule's policy does not charge. */
export const ProviderErrorNotCharged: Story = {
  args: { view: viewOf(acme(7)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Charge on error: Never'),
    ).toBeInTheDocument();
  },
};

/** 012: the reservation expired before any commit. */
export const ReservationExpired: Story = {
  args: { view: viewOf(acme(12)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/no commit arrived before it expired/),
    ).toBeInTheDocument();
  },
};

/** 001: a hold still open. */
export const OpenReservation: Story = {
  args: { view: viewOf(acme(1)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/is held until/)).toBeInTheDocument();
  },
};
