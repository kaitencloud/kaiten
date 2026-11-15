import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { acme, models, POOL, viewOf } from '../__tests__/receipt-world';
import { AddExternalIdDialog } from '../receipt/add-external-id-dialog';
import { RefundDialog } from '../receipt/refund-dialog';

/**
 * The two dialogs a receipt opens: the refund of what is left of a charge, and
 * the naming of an unknown model as an external id of a catalogue model. They
 * are shown open, over the receipt's world; neither reads anything when it
 * opens, and the stories send nothing.
 */
const meta = {
  title: 'Features/Instances/AiUsage/ReceiptDialogs',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <StorybookRouter>
        <Story />
      </StorybookRouter>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const body = () => within(document.body);

/** 017: 48.5 credits are left of a charge of 78.5; the amount opens on all of it. */
export const Refund: Story = {
  render: () => (
    <RefundDialog
      instanceSlug="acme-production"
      pool={POOL}
      transactionId="txn_acme_017"
      refund={viewOf(acme(17)).refund!}
      onClose={() => undefined}
    />
  ),
  play: async () => {
    const dialog = await body().findByRole('dialog', { name: 'Refund credits' });
    await expect(within(dialog).getByLabelText(/Credits to refund/)).toHaveValue('48.5');
    await expect(within(dialog).getByText(/cannot be undone here/)).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Refund' })).toBeEnabled();
  },
};

/** More than what is left is refused in the form, before any request. */
export const RefundAboveWhatIsLeft: Story = {
  render: Refund.render,
  play: async () => {
    const dialog = await body().findByRole('dialog', { name: 'Refund credits' });
    const amount = within(dialog).getByLabelText(/Credits to refund/);
    await userEvent.clear(amount);
    await userEvent.type(amount, '60');
    await expect(
      await within(dialog).findByText('This is more than what is left to refund.'),
    ).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Refund' })).toBeDisabled();
  },
};

/** 018: the name starts with the slug of a catalogue model, which is offered. */
export const AddExternalIdSuggested: Story = {
  render: () => (
    <AddExternalIdDialog
      sent="gpt-5-mini-2025-08-07"
      models={models}
      onClose={() => undefined}
    />
  ),
  play: async () => {
    const dialog = await body().findByRole('dialog', { name: 'Add as an external ID' });
    await expect(within(dialog).getByText('GPT-5 mini')).toBeInTheDocument();
    await expect(within(dialog).getByText(/Past inferences are not re-priced/)).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Add external ID' })).toBeEnabled();
  },
};

/** 008: no model is an obvious match; one has to be chosen. */
export const AddExternalIdNoSuggestion: Story = {
  render: () => (
    <AddExternalIdDialog
      sent="mistral-large-2411"
      models={models}
      onClose={() => undefined}
    />
  ),
  play: async () => {
    const dialog = await body().findByRole('dialog', { name: 'Add as an external ID' });
    await expect(within(dialog).getByText('Choose a model')).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Add external ID' })).toBeDisabled();
  },
};
