import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useInstanceDetailMutations } from '../use-instance-detail-mutations';

const mockMutateAsync = vi.fn();
const mockToastSuccess = vi.fn();

// The real module otherwise: the status label comes from the
// customer-management barrel, whose query options call queryOptions on load.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: () => ({ isPending: false, mutateAsync: mockMutateAsync }),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: {} }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { status?: string }) =>
      typeof options === 'object' && options?.status
        ? `${key}:${options.status}`
        : key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('@/domains/crm-sync', () => ({ startAttioSyncWatcher: vi.fn() }));

vi.mock('../../instance-query-invalidation', () => ({
  forgetDeletedInstanceQueries: vi.fn(),
  invalidateInstanceQueries: vi.fn(),
}));

describe('useInstanceDetailMutations', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue(undefined);
    mockToastSuccess.mockReset();
  });

  it('confirms a status change with a toast that can put the previous status back', async () => {
    const { result } = renderHook(() =>
      useInstanceDetailMutations('acme-production'),
    );

    await result.current.updateInstanceStatus(
      { status: 'MAINTENANCE' },
      'HEALTHY',
    );

    expect(mockMutateAsync).toHaveBeenCalledWith({
      body: { status: 'MAINTENANCE' },
      path: { instanceSlug: 'acme-production' },
    });

    const [message, options] = mockToastSuccess.mock.calls[0];
    expect(message).toContain('statusEditor.changed');
    expect(options.action.label).toBe('Common.undo');

    options.action.onClick();

    await vi.waitFor(() => {
      expect(mockMutateAsync).toHaveBeenLastCalledWith({
        body: { status: 'HEALTHY' },
        path: { instanceSlug: 'acme-production' },
      });
    });
  });

  it('offers no undo when the previous status is unknown', async () => {
    const { result } = renderHook(() =>
      useInstanceDetailMutations('acme-production'),
    );

    await result.current.updateInstanceStatus({ status: 'INCIDENT' });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('statusEditor.changed'),
      undefined,
    );
  });
});
