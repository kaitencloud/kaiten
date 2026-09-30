import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { CustomerScopedInstanceDialog } from './index';

const mockNavigate = vi.fn();
const mockInstanceFormDialog = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useSuspenseQuery: () => ({
    data: {
      id: 'customer-1',
      name: 'Acme Corp',
    },
  }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/features/customers', () => ({
  customerQueryOptions: vi.fn(() => ({})),
}));

vi.mock('@/features/instances', () => ({
  InstanceFormDialog: (props: {
    lockedCustomer?: { id: string; name: string };
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    open: boolean;
  }) => {
    mockInstanceFormDialog(props);

    return (
      <div>
        <button type="button" onClick={props.onSuccess}>
          success
        </button>
        <button
          type="button"
          onClick={() => {
            props.onOpenChange(false);
          }}
        >
          close
        </button>
      </div>
    );
  },
}));

describe('CustomerScopedInstanceDialog', () => {
  it('passes a locked customer and navigates back to customer detail on success and close', async () => {
    const user = userEvent.setup();

    render(<CustomerScopedInstanceDialog customerSlug="acme" />);

    expect(mockInstanceFormDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        lockedCustomer: { id: 'customer-1', name: 'Acme Corp' },
        open: true,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'success' }));
    expect(mockNavigate).toHaveBeenCalledWith({
      params: { customerSlug: 'acme' },
      to: '/customers/$customerSlug',
    });

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      params: { customerSlug: 'acme' },
      to: '/customers/$customerSlug',
    });
  });
});
