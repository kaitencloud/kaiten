import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC } from 'react';
import { CreateServiceAccountDialog } from '../create-dialog';

// --- Meta ---

const meta = {
  title: 'Features/ServiceAccounts/CreateServiceAccountDialog',
  component: CreateServiceAccountDialog,
  decorators: [
    (Story: FC) => (
      <div
        style={{
          minHeight: '100vh',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'responsive' },
    docs: {
      story: { inline: false, iframeHeight: '100vh' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CreateServiceAccountDialog>;

export default meta;
type Story = StoryObj<typeof CreateServiceAccountDialog>;

// --- Stories ---

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    onSubmit: () => {},
    isPending: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Create service account dialog with name input field.',
      },
    },
  },
};

export const Pending: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    onSubmit: () => {},
    isPending: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Dialog in pending state while creating a service account.',
      },
    },
  },
};
