import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { DestructiveActionButton } from '../destructive-action-button';

const baseProps = {
  cancelLabel: 'Cancel',
  confirmLabel: 'Confirm',
  description: 'This cannot be undone.',
  label: 'Delete',
  onConfirm: vi.fn(),
  title: 'Delete this customer?',
};

describe('DestructiveActionButton', () => {
  it('says why it is disabled on hover', async () => {
    const user = userEvent.setup();
    render(
      <DestructiveActionButton
        {...baseProps}
        disabled
        disabledReason="Some instances are still associated with this customer."
      />,
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();

    await user.hover(button.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Some instances are still associated with this customer.',
    );
  });

  it('asks for confirmation when enabled', async () => {
    const user = userEvent.setup();
    render(<DestructiveActionButton {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Delete this customer?',
    );
  });
});
