import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { CopyValueButton } from '../copy-value-button';

const meta = {
  title: 'Components/CopyValueButton',
  component: CopyValueButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    copiedMessage: 'Copied',
    copyFailedMessage: 'Could not be copied',
    label: 'Copy the value',
    onCopied: fn(),
    value: 'example-value-to-copy',
  },
} satisfies Meta<typeof CopyValueButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Copy the value' }),
    ).toBeVisible();
  },
};
