import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from '../delete-confirmation-dialog';

const meta = {
  title: 'Components/Dialog/DeleteConfirmationDialog',
  component: DeleteConfirmationDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DeleteConfirmationDialog>;

export default meta;
type Story = StoryObj<typeof DeleteConfirmationDialog>;

export const Default: Story = {
  args: {
    trigger: <Button variant="destructive">Delete Item</Button>,
    title: 'Delete Item',
    description:
      'Are you sure you want to delete this item? This action cannot be undone.',
    cancelLabel: 'Cancel',
    confirmLabel: 'Delete',
    onConfirm: () => {
      alert('Item deleted');
    },
  },
};

export const DeleteUser: Story = {
  args: {
    trigger: <Button variant="destructive">Delete User</Button>,
    title: 'Delete User Account',
    description: (
      <div className="space-y-2">
        <p>Are you sure you want to delete this user account?</p>
        <p className="text-sm text-muted-foreground">
          This will permanently delete the user and all associated data.
        </p>
      </div>
    ),
    cancelLabel: 'Cancel',
    confirmLabel: 'Delete User',
    onConfirm: () => {
      alert('User deleted');
    },
  },
};

export const DeleteProject: Story = {
  args: {
    trigger: (
      <Button variant="outline" size="sm">
        Delete Project
      </Button>
    ),
    title: 'Delete Project',
    description:
      'This will permanently delete the project and all its contents. This action cannot be undone.',
    cancelLabel: 'Keep Project',
    confirmLabel: 'Delete Forever',
    onConfirm: () => {
      alert('Project deleted');
    },
  },
};
