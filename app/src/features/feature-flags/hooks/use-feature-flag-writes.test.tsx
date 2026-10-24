import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { FeatureFlag } from '@/api-client';
import {
  handleGetFeatureFlag,
  handleUpdateFeatureFlag,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`, which carries the
// words of the API's refusal.
import '@/lib/api/bootstrap';
import { useFeatureFlagRename } from './use-feature-flag-rename';
import { useToggleFeatureFlag } from './use-toggle-feature-flag';

const { cacheMock, toastError, toastSuccess } = vi.hoisted(() => ({
  cacheMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

let queryClient: QueryClient;

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), track: vi.fn(), warn: vi.fn() },
}));
vi.mock('../queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../queries')>()),
  mergeFeatureFlagIntoCache: cacheMock,
  revalidateFeatureFlagsListQuery: vi.fn(),
}));

const rule = {
  name: 'EU rollout',
  rule: 'instance.region == "eu"',
  type: 'basic',
  variant: 'on',
};

const opened = {
  default_variant: { type: 'basic', value: 'on' },
  description: 'Checkout',
  enabled: true,
  event_name: 'feature_flag.evaluated',
  id: 'flag-1',
  metadata: {},
  name: 'New checkout',
  slug: 'new-checkout',
  targetings: [],
  type: 'boolean',
  variants: null,
} as unknown as FeatureFlag;

let stored: FeatureFlag;
let updates: Array<{ body: unknown; featureFlagSlug: string }>;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  cacheMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetFeatureFlag(() => HttpResponse.json(stored)),
    handleUpdateFeatureFlag(async ({ params, request }) => {
      updates.push({
        body: await request.json(),
        featureFlagSlug: params.featureFlagSlug,
      });

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const gone = () =>
  server.use(
    handleGetFeatureFlag(() =>
      HttpResponse.json(
        { detail: 'The feature flag does not exist', status: 404 },
        { status: 404 },
      ),
    ),
  );

describe('switching a flag from the list', () => {
  it('flips the switch and keeps the rules another tab saved since the list loaded', async () => {
    const { result } = renderHook(() => useToggleFeatureFlag(), { wrapper });
    stored = {
      ...opened,
      description: 'Edited in another tab',
      targetings: [rule],
    } as unknown as FeatureFlag;

    act(() => result.current.toggle(opened));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      body: expect.objectContaining({
        description: 'Edited in another tab',
        enabled: false,
        targetings: [rule],
      }),
      featureFlagSlug: 'new-checkout',
    });
    await waitFor(() =>
      expect(cacheMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enabled: false, targetings: [rule] }),
        'new-checkout',
      ),
    );
  });

  it('says the flag is gone when it was deleted meanwhile, and writes nothing', async () => {
    const { result } = renderHook(() => useToggleFeatureFlag(), { wrapper });
    gone();

    act(() => result.current.toggle(opened));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'The feature flag does not exist',
      ),
    );
    expect(updates).toEqual([]);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('renaming a flag from its page', () => {
  it('sends the name on top of the flag as the API holds it', async () => {
    const { result } = renderHook(() => useFeatureFlagRename(opened), {
      wrapper,
    });
    stored = {
      ...opened,
      enabled: false,
      targetings: [rule],
    } as unknown as FeatureFlag;

    await act(() => result.current('Checkout v2'));

    expect(updates).toEqual([
      {
        body: expect.objectContaining({
          enabled: false,
          name: 'Checkout v2',
          targetings: [rule],
        }),
        featureFlagSlug: 'new-checkout',
      },
    ]);
  });

  it('rejects when the flag was deleted meanwhile, and writes nothing', async () => {
    const { result } = renderHook(() => useFeatureFlagRename(opened), {
      wrapper,
    });
    gone();

    await expect(act(() => result.current('Checkout v2'))).rejects.toBeDefined();
    expect(updates).toEqual([]);
  });
});
