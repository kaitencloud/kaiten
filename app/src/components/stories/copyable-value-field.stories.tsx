import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { CopyableValueField } from '../copyable-value-field';

const meta = {
  title: 'Components/CopyableValueField',
  component: CopyableValueField,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    copiedMessage: 'Copied',
    copyFailedMessage: 'Could not be copied',
    copyLabel: 'Copy the value',
    label: 'Secret value',
    onCopied: fn(),
    value: 'example-value-to-copy',
  },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CopyableValueField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('textbox', { name: 'Secret value' }),
    ).toHaveValue('example-value-to-copy');
    await expect(
      canvas.getByRole('button', { name: 'Copy the value' }),
    ).toBeVisible();
  },
};

export const Focused: Story = {
  args: { autoFocus: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('textbox', { name: 'Secret value' }),
    ).toHaveFocus();
  },
};
