import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { featureFlagFormOpts } from '../utils/shared-form';
import { useFeatureFlagForm } from './use-feature-flag-form';

const {
  cacheFeatureFlagMock,
  captured,
  createMutateAsyncMock,
  invalidateQueriesMock,
  removeQueriesMock,
  revalidateFeatureFlagsListQueryMock,
  mockForm,
  mutationHookState,
  navigateMock,
  setQueryDataMock,
  toastErrorMock,
  toastSuccessMock,
  updateMutateAsyncMock,
  useAppFormMock,
} = vi.hoisted(() => ({
  cacheFeatureFlagMock: vi.fn(),
  captured: {
    options: null as any,
  },
  createMutateAsyncMock: vi.fn(),
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
  mutationHookState: {
    callIndex: 0,
  },
  navigateMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateMutateAsyncMock: vi.fn(),
  useAppFormMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: any) => {
    const isCreateMutation = mutationHookState.callIndex === 0;
    mutationHookState.callIndex += 1;

    if (isCreateMutation) {
      return {
        isPending: false,
        mutateAsync: async (payload: unknown) => {
          createMutateAsyncMock(payload);
          await config.onSuccess?.(undefined, payload);

          return { slug: 'created-flag' };
        },
      };
    }

    return {
      isPending: false,
      mutateAsync: async (payload: unknown) => {
        updateMutateAsyncMock(payload);
        await config.onSuccess?.(undefined, payload);
      },
    };
  },
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

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  createFeatureFlagMutation: vi.fn(() => ({})),
  updateFeatureFlagMutation: vi.fn(() => ({})),
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

describe('useFeatureFlagForm', () => {
  beforeEach(() => {
    cacheFeatureFlagMock.mockReset();
    captured.options = null;
    createMutateAsyncMock.mockReset();
    invalidateQueriesMock.mockReset();
    mockForm.handleSubmit.mockReset();
    mockForm.setFieldValue.mockReset();
    mockForm.state.values.metadata = {};
    mutationHookState.callIndex = 0;
    navigateMock.mockReset();
    removeQueriesMock.mockReset();
    revalidateFeatureFlagsListQueryMock.mockReset();
    setQueryDataMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    updateMutateAsyncMock.mockReset();
    useAppFormMock.mockReset();
  });

  it('submits creation through the create mutation and navigates back to the list', async () => {
    renderHook(() => useFeatureFlagForm({}));

    await act(async () => {
      await captured.options.onSubmit({ value: baseFormValues });
    });

    expect(createMutateAsyncMock).toHaveBeenCalledWith({
      body: baseFormValues,
    });
    expect(updateMutateAsyncMock).not.toHaveBeenCalled();
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

    renderHook(() => useFeatureFlagForm({ featureFlag } as any));

    await act(async () => {
      await captured.options.onSubmit({ value: updatedValues });
    });

    expect(updateMutateAsyncMock).toHaveBeenCalledWith({
      body: updatedValues,
      path: { featureFlagSlug: 'old-feature-flag' },
    });
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
    const { result } = renderHook(() =>
      useFeatureFlagForm({ featureFlag } as any),
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
    const { result } = renderHook(() => useFeatureFlagForm({}));

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
    const { result } = renderHook(() => useFeatureFlagForm({}));
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
