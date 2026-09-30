import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { CustomerFormDialog } from '../customer-form-dialog';

const mockCustomerForm = vi.fn();
const mockStackedFormDialog = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/functionals/stacked-form-dialog', () => ({
  StackedFormDialog: (props: {
    children: React.ReactNode;
    className?: string;
    confirmOnClose?: boolean;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    title: string;
  }) => {
    mockStackedFormDialog(props);
    return <div>{props.children}</div>;
  },
}));

vi.mock('../customer-form', () => ({
  CustomerForm: (props: { onCancel?: () => void; onSuccess?: () => void }) => {
    mockCustomerForm(props);

    return (
      <div>
        <button type="button" onClick={props.onSuccess}>
          submit
        </button>
        <button type="button" onClick={props.onCancel}>
          cancel
        </button>
      </div>
    );
  },
}));

describe('CustomerFormDialog', () => {
  it('uses the explicit success handler when provided', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CustomerFormDialog
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mockStackedFormDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmOnClose: false,
        title: 'Pages.Customers.Mutation.titleNew',
      }),
    );
  });

  it('falls back to closing the dialog after success', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<CustomerFormDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes the dialog on cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<CustomerFormDialog open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
