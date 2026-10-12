import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import { useDeletionRefusal } from '../hooks';

vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

const refusal = (code: string, value: unknown) =>
  new ApiError({
    data: {
      code,
      detail: 'It is billed',
      errors: [{ location: 'x', message: 'm', value }],
      status: 409,
    },
    status: 409,
  });

describe('useDeletionRefusal', () => {
  it('shows nothing until a refusal comes', () => {
    const { result } = renderHook(() => useDeletionRefusal('acme'));

    expect(result.current.dialog).toBeNull();
  });

  it('opens the dialog for a refusal that says what stands in the way, and says it did', () => {
    const { result } = renderHook(() => useDeletionRefusal('acme'));
    let shown = false;

    act(() => {
      shown = result.current.showRefusal(
        refusal('DeleteCustomer.BillingActive', {
          live: true,
          unpaidInvoiceIds: ['inv-1'],
        }),
      );
    });
    render(<>{result.current.dialog}</>);

    expect(shown).toBe(true);
    expect(
      screen.getByRole('dialog', { name: 'This customer cannot be deleted' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the customer' })).toBeInTheDocument();
  });

  it('takes the record from the call, for a list that holds the dialog above its rows', () => {
    const { result } = renderHook(() => useDeletionRefusal());
    let shown = false;

    act(() => {
      shown = result.current.showRefusal(
        refusal('DeleteEntitlement.InUseConflict', { usageCounters: 3 }),
        'api-calls',
      );
    });
    render(<>{result.current.dialog}</>);

    expect(shown).toBe(true);
    expect(
      screen.getByRole('dialog', { name: 'This entitlement cannot be deleted' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the entitlement' }),
    ).toBeInTheDocument();
  });

  it('keeps one showRefusal from a render to the next, so that columns built on it are not rebuilt', () => {
    const { rerender, result } = renderHook(() => useDeletionRefusal());
    const first = result.current.showRefusal;

    rerender();

    expect(result.current.showRefusal).toBe(first);
  });

  it('leaves any other failure to the message it had', () => {
    const { result } = renderHook(() => useDeletionRefusal('acme'));
    let shown = true;

    act(() => {
      shown = result.current.showRefusal(
        new ApiError({ data: { code: 'DeleteCustomer.NotFound', status: 404 }, status: 404 }),
      );
    });

    expect(shown).toBe(false);
    expect(result.current.dialog).toBeNull();
  });

  it('closes, and the record stays where it was', async () => {
    function Harness() {
      const deletion = useDeletionRefusal('acme');

      return (
        <>
          <button
            onClick={() =>
              deletion.showRefusal(
                refusal('DeleteInstance.BillingActive', {
                  status: 'ACTIVE',
                  unpaidInvoiceIds: [],
                }),
              )
            }
            type="button"
          >
            Delete
          </button>
          {deletion.dialog}
        </>
      );
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
