import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import {
  buildAddon,
  buildInstanceAddon,
  buildPrice,
} from '@/test-fixtures/storybook-billing-fixtures';
import { InstanceAddonActionsProvider } from '../instance-detail/tabs/billing/addons/instance-addon-actions-context';
import { InstanceAddonsTable } from '../instance-detail/tabs/billing/addons/instance-addons-table';
import { QuantityStepper } from '../instance-detail/tabs/billing/addons/quantity-stepper';
import { RemoveAddonDialog } from '../instance-detail/tabs/billing/addons/remove-addon-dialog';
import type { InstanceAddonActions } from '../../hooks/use-instance-addon-actions';
import { joinHeldAddons } from '../../utils/instance-addons.utils';

const meta = {
  title: 'Features/Instances/BillingAddons',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const SEATS = buildAddon({
  familySlug: 'extra-seats',
  maxQuantity: 3,
  name: 'Extra seats',
  slug: 'extra-seats-v1',
  versionName: '2026',
});
const STORAGE = buildAddon({
  familySlug: 'extra-storage',
  lifecycleState: 'ARCHIVED',
  maxQuantity: 20,
  name: 'Extra storage',
  slug: 'extra-storage-v1',
  versionName: '2025',
});
const SUPPORT = buildAddon({
  familySlug: 'priority-support',
  maxQuantity: 1,
  name: 'Priority support',
  pricingType: 'CUSTOM',
  slug: 'priority-support-v1',
  versionName: '2026',
});
const SEATS_MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Extra seat, monthly',
  id: 'price-seats-monthly',
  isDefault: true,
  unitAmountDecimal: '1000',
});
const STORAGE_IN_ARREARS = buildPrice({
  billingPeriod: 'MONTHLY',
  billingTiming: 'ARREARS',
  displayLabel: 'Extra storage, monthly',
  id: 'price-storage-monthly',
  isDefault: true,
  unitAmountDecimal: '800',
});

const HELD_SEATS = buildInstanceAddon({
  addon: SEATS,
  attachedAt: '2027-02-08T00:00:00.000Z',
  id: 'attachment-seats',
  prices: [SEATS_MONTHLY],
  quantity: 2,
});
const HELD_STORAGE = buildInstanceAddon({
  addon: STORAGE,
  attachedAt: '2026-11-20T00:00:00.000Z',
  id: 'attachment-storage',
  prices: [STORAGE_IN_ARREARS],
  quantity: 3,
});
const HELD_SUPPORT = buildInstanceAddon({
  addon: SUPPORT,
  attachedAt: '2027-03-01T00:00:00.000Z',
  id: 'attachment-support',
  quantity: 1,
});

const idle = (): InstanceAddonActions => ({
  closing: false,
  failure: null,
  pending: null,
  perform: fn(async () => true),
  retry: fn(async () => false),
});

// The stepper is a group named by what it counts: the buttons stop at the bounds.
export const Stepper: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-8">
      {[1, 2, 3].map((value) => (
        <QuantityStepper
          key={value}
          labels={{
            decrease: `One unit fewer (${value})`,
            group: `Quantity ${value} of 3`,
            increase: `One unit more (${value})`,
          }}
          max={3}
          onChange={fn()}
          value={value}
        />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('button', { name: 'One unit fewer (1)' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'One unit more (1)' })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'One unit more (3)' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'One unit fewer (3)' })).toBeEnabled();
  },
};

export const SteppingDisabled: Story = {
  render: () => (
    <QuantityStepper
      disabled
      labels={{ decrease: 'One unit fewer', group: 'Quantity', increase: 'One unit more' }}
      onChange={fn()}
      value={2}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('button', { name: 'One unit fewer' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'One unit more' })).toBeDisabled();
  },
};

// What an instance holds: the version and its slug, the quantity, what a unit costs
// by the period of the subscription, and since when. A version withdrawn from sale
// since says so, and one that is sold on request has no price.
export const HeldAddons: Story = {
  render: () => (
    <InstanceAddonActionsProvider actions={idle()}>
      <InstanceAddonsTable
        mayDetach
        maySetQuantity
        rows={joinHeldAddons(
          [HELD_SEATS, HELD_STORAGE, HELD_SUPPORT],
          [SEATS, STORAGE, SUPPORT],
        )}
      />
    </InstanceAddonActionsProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Extra seats · 2026')).toBeVisible();
    await expect(canvas.getByText('extra-seats-v1')).toBeVisible();
    await expect(canvas.getByText('$10.00')).toBeVisible();
    await expect(canvas.getByText('Withdrawn')).toBeVisible();
    await expect(canvas.getByText('On request')).toBeVisible();
    await expect(canvas.getAllByRole('group')).toHaveLength(3);
  },
};

// A change goes to the card, which makes it: the story only sees what is asked.
export const SteppingAsksForAChange: Story = {
  render: () => {
    const actions = idle();

    return (
      <InstanceAddonActionsProvider actions={actions}>
        <InstanceAddonsTable
          mayDetach
          maySetQuantity
          rows={joinHeldAddons([HELD_SEATS], [SEATS])}
        />
      </InstanceAddonActionsProvider>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'One unit more of Extra seats · 2026' }),
    );
    await expect(canvas.getByTestId('quantity-value')).toHaveTextContent('2');
  },
};

// A session that may not change them reads the same rows with no control.
export const ReadOnly: Story = {
  render: () => (
    <InstanceAddonActionsProvider actions={idle()}>
      <InstanceAddonsTable
        mayDetach={false}
        maySetQuantity={false}
        rows={joinHeldAddons([HELD_SEATS], [SEATS])}
      />
    </InstanceAddonActionsProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Extra seats · 2026')).toBeVisible();
    await expect(canvas.queryByRole('group')).toBeNull();
    await expect(canvas.queryByRole('button', { name: /Remove/ })).toBeNull();
  },
};

// A change being made keeps the others from being asked for: every control is off,
// and the quantity asked for stays on its stepper until the API answers.
export const ChangeInProgress: Story = {
  render: () => {
    const actions: InstanceAddonActions = {
      ...idle(),
      pending: { held: HELD_SEATS, kind: 'quantity', label: 'Extra seats · 2026', quantity: 3 },
    };

    return (
      <InstanceAddonActionsProvider actions={actions}>
        <InstanceAddonsTable
          mayDetach
          maySetQuantity
          rows={joinHeldAddons([HELD_SEATS], [SEATS])}
        />
      </InstanceAddonActionsProvider>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByTestId('quantity-value')).toHaveTextContent('3');
    await expect(
      canvas.getByRole('button', { name: 'One unit more of Extra seats · 2026' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('button', { name: 'Remove Extra seats · 2026' }),
    ).toBeDisabled();
  },
};

// Removing an add-on is asked first, with what it costs: nothing is refunded for the
// period under way, and the add-on is no longer billed from the next invoice.
export const RemoveBilledInAdvance: Story = {
  render: () => (
    <RemoveAddonDialog
      onClose={fn()}
      onConfirm={fn()}
      row={joinHeldAddons([HELD_SEATS], [SEATS])[0]!}
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole('alertdialog');

    // A dialog fades in: it is there, and not yet visible at the first frame.
    await expect(
      within(dialog).getByText('Remove Extra seats · 2026 from this instance?'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByTestId('remove-addon-billing')).toHaveTextContent(
        'The current period is not refunded, and the add-on is no longer billed from the next invoice.',
      ),
    );
  },
};

// One billed in arrears is charged for the period under way even when it is removed.
export const RemoveBilledInArrears: Story = {
  render: () => (
    <RemoveAddonDialog
      onClose={fn()}
      onConfirm={fn()}
      row={joinHeldAddons([HELD_STORAGE], [STORAGE])[0]!}
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole('alertdialog');

    await waitFor(() =>
      expect(within(dialog).getByTestId('remove-addon-billing')).toHaveTextContent(
        'billed in arrears: the period under way is still billed in full',
      ),
    );
  },
};

const removal = { onClose: fn(), onConfirm: fn() };

// Cancelling leaves the add-on where it is; confirming asks the card for the change
// and closes the dialog, which does not wait for the answer.
export const RemoveAsksBeforeActing: Story = {
  render: () => (
    <RemoveAddonDialog
      onClose={removal.onClose}
      onConfirm={removal.onConfirm}
      row={joinHeldAddons([HELD_SEATS], [SEATS])[0]!}
    />
  ),
  play: async () => {
    removal.onClose.mockClear();
    removal.onConfirm.mockClear();
    const dialog = await screen.findByRole('alertdialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(removal.onClose).toHaveBeenCalled());
    await expect(removal.onConfirm).not.toHaveBeenCalled();
  },
};
