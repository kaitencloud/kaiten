import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { DestructiveActionButton } from '../destructive-action-button';

const meta = {
  title: 'Components/DestructiveActionButton',
  component: DestructiveActionButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    label: 'Delete',
    title: 'Delete this resource?',
    description:
      'This action cannot be undone. The resource and all its associated data will be permanently removed.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Delete',
    onConfirm: fn(),
  },
} satisfies Meta<typeof DestructiveActionButton>;

export default meta;
type Story = StoryObj<typeof DestructiveActionButton>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const LongDescription: Story = {
  args: {
    title: 'Revoke service account token?',
    description:
      'Any integrations or scripts using this token will immediately stop working. Revocation cannot be undone, you will need to issue a new token to restore access.',
    confirmLabel: 'Revoke token',
  },
};
