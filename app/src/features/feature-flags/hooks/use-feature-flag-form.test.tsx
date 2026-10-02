import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleCreateFeatureFlag,
  handleUpdateFeatureFlag,
} from '@/api-client/msw.gen';
import { featureFlagFormOpts } from '../utils/shared-form';
import { useFeatureFlagForm } from './use-feature-flag-form';

const {
  cacheFeatureFlagMock,
  captured,
  invalidateQueriesMock,
  removeQueriesMock,
  revalidateFeatureFlagsListQueryMock,
  mockForm,
  navigateMock,
  setQueryDataMock,
  toastErrorMock,
  toastSuccessMock,
  useAppFormMock,
} = vi.hoisted(() => ({
  cacheFeatureFlagMock: vi.fn(),
  captured: {
    options: null as any,
  },
  invalidateQueriesMock: vi.fn(),
  removeQueriesMock: vi.fn(),
  revalidateFeatureFlagsListQueryMock: vi.fn(),
  mockForm: {
    handleSubmit: vi.fn(),
    setFieldValue: vi.fn(),
    state: {
      values: {
        metadata: {} as Record<string, unknown>,
      },
    },
  },
  navigateMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useAppFormMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({
    queryClient: {
      invalidateQueries: invalidateQueriesMock,
      removeQueries: removeQueriesMock,
      setQueryData: setQueryDataMock,
    },
  }),
  useRouter: () => ({
    navigate: navigateMock,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock('../queries', () => ({
  mergeFeatureFlagIntoCache: (...args: unknown[]) =>
    cacheFeatureFlagMock(...args),
  revalidateFeatureFlagsListQuery: (...args: unknown[]) =>
    revalidateFeatureFlagsListQueryMock(...args),
}));

vi.mock('@/features/feature-flags/variants', async () => {
  const { z } = await import('zod');

  return {
    mapToFormVariants: (variants: unknown) => variants,
    variantFormSchema: z.object({
      description: z.string().optional(),
      name: z.string(),
      value: z.unknown(),
    }),
  };
});

vi.mock('@/hooks/form', () => ({
  useAppForm: (options: unknown) => {
    captured.options = options;
    useAppFormMock(options);

    return mockForm;
  },
}));

const baseFormValues = {
  ...featureFlagFormOpts.defaultValues,
  default_variant: {
    type: 'basic',
    value: 'on',
  } as const,
  description: 'Test description',
  enabled: true,
  metadata: {
    owner: 'team-platform',
  },
  name: 'My feature flag',
  slug: 'my-feature-flag',
  targetings: [],
  type: 'boolean' as const,
  variants: [
    {
      description: 'Enabled',
      name: 'on',
      value: true,
    },
  ],
};

type ApiCall =
  | { op: 'create'; body: unknown }
  | { op: 'update'; featureFlagSlug: string; body: unknown };

/**
 * Serves the creation and the update of a flag, and records them with the
 * slug and the body each one carried.
 */
function serveFeatureFlagWrites() {
  const calls: ApiCall[] = [];

  server.use(
    handleCreateFeatureFlag(async ({ request }) => {
      const body = await request.json();
      calls.push({ op: 'create', body });
      return HttpResponse.json(
        { ...body, id: 'feature-flag-id' },
        { status: 201 },
      );
    }),
    handleUpdateFeatureFlag(async ({ params, request }) => {
      calls.push({
        op: 'update',
        featureFlagSlug: params.featureFlagSlug,
        body: await request.json(),
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return calls;
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useFeatureFlagForm', () => {
  let calls: ApiCall[];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    calls = serveFeatureFlagWrites();
    cacheFeatureFlagMock.mockReset();
    captured.options = null;
    invalidateQueriesMock.mockReset();
    mockForm.handleSubmit.mockReset();
    mockForm.setFieldValue.mockReset();
    mockForm.state.values.metadata = {};
    navigateMock.mockReset();
    removeQueriesMock.mockReset();
    revalidateFeatureFlagsListQueryMock.mockReset();
    setQueryDataMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    useAppFormMock.mockReset();
  });

  it('submits creation through the create mutation and navigates back to the list', async () => {
    renderHook(() => useFeatureFlagForm({}), { wrapper });

    await act(async () => {
      await captured.options.onSubmit({ value: baseFormValues });
    });

    expect(calls).toEqual([{ op: 'create', body: baseFormValues }]);
    expect(cacheFeatureFlagMock).not.toHaveBeenCalled();
    expect(revalidateFeatureFlagsListQueryMock).toHaveBeenCalledWith(
      expect.anything(),
    );
    expect(navigateMock).toHaveBeenCalledWith({ to: '/feature-flags' });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Pages.FeatureFlags.Mutation.Form.Dialog.createSuccess',
    );
  });

  it('submits edition through the update mutation, invalidates detail, and navigates to the edited flag', async () => {
    const featureFlag = {
      ...baseFormValues,
      event_name: 'feature_flag.evaluated',
      id: 'feature-flag-id',
      slug: 'old-feature-flag',
    };
    const updatedValues = {
      ...baseFormValues,
      slug: 'new-feature-flag',
    };

    renderHook(() => useFeatureFlagForm({ featureFlag } as any), { wrapper });

    await act(async () => {
      await captured.options.onSubmit({ value: updatedValues });
    });

    expect(calls).toEqual([
      {
        op: 'update',
        featureFlagSlug: 'old-feature-flag',
        body: updatedValues,
      },
    ]);
    expect(cacheFeatureFlagMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: 'new-feature-flag' }),
      'old-feature-flag',
    );
    expect(revalidateFeatureFlagsListQueryMock).toHaveBeenCalledWith(
      expect.anything(),
    );
    expect(navigateMock).toHaveBeenCalledWith({
      params: { featureFlagSlug: 'new-feature-flag' },
      search: {},
      to: '/feature-flags/$featureFlagSlug',
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'Pages.FeatureFlags.Mutation.Form.Dialog.updateSuccess',
    );
  });

  it('navigates back to the current detail page when cancelling in edit mode', () => {
    const featureFlag = {
      ...baseFormValues,
      event_name: 'feature_flag.evaluated',
      id: 'feature-flag-id',
      slug: 'existing-feature-flag',
    };
    const { result } = renderHook(
      () => useFeatureFlagForm({ featureFlag } as any),
      { wrapper },
    );

    act(() => {
      result.current.handleCancel();
    });

    expect(navigateMock).toHaveBeenCalledWith({
      params: { featureFlagSlug: 'existing-feature-flag' },
      search: {},
      to: '/feature-flags/$featureFlagSlug',
    });
  });

  it('opens the type change dialog and restores the previous type when cancelling', () => {
    const { result } = renderHook(() => useFeatureFlagForm({}), { wrapper });

    act(() => {
      captured.options.listeners.onChange({
        formApi: {
          state: {
            values: {
              ...baseFormValues,
              targetings: [],
              type: 'string',
            },
          },
        },
      });
    });

    expect(result.current.dialog.open).toBe(true);

    act(() => {
      result.current.dialog.onCancel();
    });

    expect(mockForm.setFieldValue).toHaveBeenCalledWith('type', 'boolean');
    expect(result.current.dialog.open).toBe(false);
  });

  it('resets type-dependent fields and preserves unrelated metadata when confirming a type change', () => {
    const { result } = renderHook(() => useFeatureFlagForm({}), { wrapper });
    mockForm.state.values.metadata = {
      fallback_value: true,
      owner: 'team-platform',
    };

    act(() => {
      captured.options.listeners.onChange({
        formApi: {
          state: {
            values: {
              ...baseFormValues,
              targetings: [
                {
                  name: 'EU rollout',
                  rule: 'instance.region == "eu"',
                  type: 'basic',
                  variant: 'on',
                },
              ],
              type: 'string',
            },
          },
        },
      });
    });

    act(() => {
      result.current.dialog.onConfirm();
    });

    expect(mockForm.setFieldValue.mock.calls).toEqual([
      ['variants', null],
      ['default_variant', featureFlagFormOpts.defaultValues.default_variant],
      ['targetings', []],
      ['metadata', { owner: 'team-platform' }],
      ['type', 'string'],
    ]);
    expect(result.current.dialog.open).toBe(false);
  });
});
