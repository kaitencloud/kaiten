import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useReleaseForm } from '../use-release-form';

type CapturedMutationOptions = {
  onSuccess?: (createdRelease: { slug?: string }) => Promise<void> | void;
};

const { navigateMock, captured } = vi.hoisted(() => ({
  captured: { options: undefined as CapturedMutationOptions | undefined },
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: CapturedMutationOptions) => {
    captured.options = options;
    return { isPending: false, mutateAsync: vi.fn() };
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useRouteContext: () => ({ queryClient: {} }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/form', () => ({ useAppForm: () => ({}) }));

vi.mock('../../queries', () => ({ invalidateReleaseQueries: vi.fn() }));

describe('useReleaseForm', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    captured.options = undefined;
  });

  it('opens the release it just created', async () => {
    renderHook(() => useReleaseForm({ releases: [] }));

    await captured.options?.onSuccess?.({ slug: 'v0-2-0' });

    expect(navigateMock).toHaveBeenCalledWith({
      params: { releaseSlug: 'v0-2-0' },
      to: '/releases/$releaseSlug',
    });
  });

  it('falls back to the releases list when the created release has no slug', async () => {
    renderHook(() => useReleaseForm({ releases: [] }));

    await captured.options?.onSuccess?.({});

    expect(navigateMock).toHaveBeenCalledWith({ to: '/releases' });
  });
});
