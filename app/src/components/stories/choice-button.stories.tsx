import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ChoiceButton } from '../choice-button';

const meta = {
  title: 'Components/ChoiceButton',
  component: ChoiceButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    detail: 'A discount on the invoices of an instance',
    label: 'Price',
    onSelect: fn(),
    selected: false,
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChoiceButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pressed: Story = {
  args: { selected: true },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Price' });

    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveAccessibleDescription(
      'A discount on the invoices of an instance',
    );
  },
};

export const Choosable: Story = {
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Price' });

    await userEvent.click(button);

    await expect(args.onSelect).toHaveBeenCalledTimes(1);
  },
};

/**
 * A choice that cannot be made stays in the tab order and says why, so that the
 * reason is read by whoever the option is read by.
 */
export const UnavailableWithItsReason: Story = {
  args: {
    detail: 'Available in a later version',
    disabled: true,
    label: 'Flag grant',
  },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Flag grant',
    });

    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).not.toBeDisabled();
    await expect(button).toHaveAccessibleDescription(
      'Available in a later version',
    );

    await userEvent.click(button);

    await expect(args.onSelect).not.toHaveBeenCalled();
  },
};
