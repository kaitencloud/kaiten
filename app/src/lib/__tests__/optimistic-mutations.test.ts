import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { optimisticDeleteCallbacks } from '../optimistic-mutations';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

const KEY = ['entitlements'];
const rows = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
];

let queryClient: QueryClient;

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  queryClient = new QueryClient();
  queryClient.setQueryData(KEY, { items: rows });
});

describe('optimisticDeleteCallbacks', () => {
  const messages = { error: 'Could not delete', success: 'Deleted' };

  it('takes the row out of the list at once, and puts it back when the delete fails, with a toast', async () => {
    const callbacks = optimisticDeleteCallbacks(queryClient, KEY, 'a', messages);

    const context = await callbacks.onMutate();
    expect(queryClient.getQueryData(KEY)).toEqual({ items: [rows[1]] });
    callbacks.onError(new Error('boom'), undefined, context);

    expect(queryClient.getQueryData(KEY)).toEqual({ items: rows });
    expect(toast.error).toHaveBeenCalledWith('Could not delete');
  });

  it('says it was deleted once it was', () => {
    optimisticDeleteCallbacks(queryClient, KEY, 'a', messages).onSuccess();

    expect(toast.success).toHaveBeenCalledWith('Deleted');
  });

  it('puts the row back without a toast when the caller shows the failure itself', async () => {
    const handleError = vi.fn(() => true);
    const callbacks = optimisticDeleteCallbacks<
      { id: string },
      { path: { slug: string } }
    >(queryClient, KEY, 'a', messages, { handleError });
    const failure = new Error('refused');
    const variables = { path: { slug: 'a' } };

    const context = await callbacks.onMutate();
    callbacks.onError(failure, variables, context);

    // It is given what the delete was sent for, to say which record was refused.
    expect(handleError).toHaveBeenCalledWith(failure, variables);
    expect(queryClient.getQueryData(KEY)).toEqual({ items: rows });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the toast for a failure the caller does not handle', async () => {
    const callbacks = optimisticDeleteCallbacks(queryClient, KEY, 'a', messages, {
      handleError: () => false,
    });

    const context = await callbacks.onMutate();
    callbacks.onError(new Error('boom'), undefined, context);

    expect(toast.error).toHaveBeenCalledWith('Could not delete');
  });
});
