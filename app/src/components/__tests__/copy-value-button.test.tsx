import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { CopyValueButton } from '../copy-value-button';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderButton(onCopied = vi.fn()) {
  render(
    <CopyValueButton
      copiedMessage="Copied"
      copyFailedMessage="Could not be copied"
      label="Copy the value"
      onCopied={onCopied}
      value="secret-123"
    />,
  );

  return onCopied;
}

describe('CopyValueButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('is a button named by the caller', () => {
    renderButton();

    expect(
      screen.getByRole('button', { name: 'Copy the value' }),
    ).toBeVisible();
  });

  it('writes the value to the clipboard and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const onCopied = renderButton();

    await user.click(screen.getByRole('button', { name: 'Copy the value' }));

    expect(writeText).toHaveBeenCalledWith('secret-123');
    expect(toast.success).toHaveBeenCalledWith('Copied');
    expect(onCopied).toHaveBeenCalledTimes(1);
  });

  it('says so when the clipboard refuses, without reporting a copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied'),
    );
    const onCopied = renderButton();

    await user.click(screen.getByRole('button', { name: 'Copy the value' }));

    expect(toast.error).toHaveBeenCalledWith('Could not be copied');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
  });
});
