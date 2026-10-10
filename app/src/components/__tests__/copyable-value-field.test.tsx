import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { CopyableValueField } from '../copyable-value-field';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderField(onCopied = vi.fn()) {
  render(
    <CopyableValueField
      copiedMessage="Copied"
      copyFailedMessage="Could not be copied"
      copyLabel="Copy the value"
      label="Secret value"
      onCopied={onCopied}
      value="secret-123"
    />,
  );

  return onCopied;
}

describe('CopyableValueField', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('shows the value in a read-only field', () => {
    renderField();

    const field = screen.getByRole('textbox', { name: 'Secret value' });
    expect(field).toHaveValue('secret-123');
    expect(field).toHaveAttribute('readonly');
  });

  it('writes the value to the clipboard and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const onCopied = renderField();

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
    const onCopied = renderField();

    await user.click(screen.getByRole('button', { name: 'Copy the value' }));

    expect(toast.error).toHaveBeenCalledWith('Could not be copied');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
  });

  it('reports a copy of the selected field made by the browser', async () => {
    const user = userEvent.setup();
    const onCopied = renderField();

    await user.click(screen.getByRole('textbox', { name: 'Secret value' }));
    await user.copy();

    expect(onCopied).toHaveBeenCalledTimes(1);
  });
});
