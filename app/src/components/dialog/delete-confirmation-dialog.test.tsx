import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from './delete-confirmation-dialog';

describe('DeleteConfirmationDialog', () => {
  it('wraps long descriptions without overflowing and confirms the action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <DeleteConfirmationDialog
        trigger={<Button>Delete webhook</Button>}
        title="Are you sure?"
        description="This action cannot be undone. This will delete https://play.svix.com/in/e_Exgrr7HQbGy4BY5iGJb4LHWCzXA/"
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete webhook' }));

    const description = screen.getByText(
      /This action cannot be undone\. This will delete https:\/\/play\.svix\.com/,
    );

    expect(description).toHaveClass(
      'w-full',
      'min-w-0',
      'max-w-full',
      'whitespace-normal',
      'wrap-anywhere',
      'text-center',
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
