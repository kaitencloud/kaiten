import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { CustomerScopedInstanceDialog } from './index';

const mockNavigate = vi.fn();
const mockInstanceFormDialog = vi.fn();

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
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

vi.mock('@/features/customers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/customers')>();

  // The real address builder, so the test reads where the dialog leads to.
  return {
    customerQueryOptions: vi.fn(() => ({})),
    getCustomerDetailTarget: actual.getCustomerDetailTarget,
  };
});

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

  it('closes onto the page of a customer whose slug a static route of /customers takes, not onto that route', async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    render(<CustomerScopedInstanceDialog customerSlug="checkout-sessions" />);

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      params: { customerSlug: 'checkout-sessions' },
      to: '/customers/$customerSlug/overview',
    });
  });
});
