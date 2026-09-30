import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { InstanceForm } from './instance-form';

const createMutationSpy = vi.fn();
const listCustomersOptionsSpy = vi.fn();
const invalidateInstancesListQueriesSpy = vi.fn();
const mockRouterNavigate = vi.fn();
const instanceInformationFieldsSpy = vi.fn();
const startAttioSyncWatcherSpy = vi.fn();
const toastSuccessSpy = vi.fn();
const setQueryDataSpy = vi.fn();
const mockQueryClient = {
  setQueryData: (...args: unknown[]) => setQueryDataSpy(...args),
};

let capturedFormOptions: {
  defaultValues: Record<string, unknown>;
  onSubmit: ({ value }: { value: Record<string, unknown> }) => Promise<void>;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: {
    onSuccess?: (_data: unknown, variables: unknown) => Promise<void> | void;
  }) => ({
    isPending: false,
    mutateAsync: async (variables: unknown) => {
      createMutationSpy(variables);
      const createdInstance = {
        integrations: {},
        slug: 'acme-instance',
      };
      await config.onSuccess?.(createdInstance, variables);
      return createdInstance;
    },
  }),
  useSuspenseQuery: () => ({
    data: {
      items: [
        {
          id: 'license-1',
          name: 'Starter',
          slug: 'starter',
        },
      ],
    },
  }),
  // The form soft-fetches the active MetadataField list to decide whether the
  // metadata step exists. Empty here: this suite covers the locked-customer
  // seeding, not the step list.
  useQuery: () => ({ data: [] }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: (...args: unknown[]) => toastSuccessSpy(...args),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: mockQueryClient }),
  useRouter: () => ({
    navigate: mockRouterNavigate,
  }),
}));

vi.mock('@/domains/metadata-fields', () => ({
  metadataFieldsActiveQueryOptions: () => ({
    queryFn: async () => [],
    queryKey: ['stub', 'metadata-fields', 'INSTANCE'],
  }),
}));

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  createInstanceMutation: () => ({}),
  getInstanceQueryKey: (options: unknown) => ['getInstance', options],
  getLicensesOptions: () => ({}),
  listCustomersOptions: () => {
    listCustomersOptionsSpy();
    return {};
  },
  listDeploymentZonesOptions: () => ({}),
  patchInstanceMutation: () => ({}),
  updateInstanceMutation: () => ({}),
}));

vi.mock('@/hooks/form', () => ({
  createFormSubmitHandler: () => () => undefined,
  useAppForm: (options: typeof capturedFormOptions) => {
    capturedFormOptions = options;

    return {
      handleSubmit: vi.fn(),
      AppForm: ({ children }: { children: React.ReactNode }) => children,
      SubmitButton: ({ label }: { label: string }) => label,
      Subscribe: ({
        children,
      }: {
        children: (state: {
          isDirty: boolean;
          isSubmitting: boolean;
          isValid: boolean;
          isValidating: boolean;
          values: Record<string, unknown>;
        }) => React.ReactNode;
      }) =>
        children({
          isDirty: true,
          isSubmitting: false,
          isValid: true,
          isValidating: false,
          values: {
            customerId: 'customer-1',
            description: 'Acme production',
            licenseDate: {
              from: new Date('2026-01-01T00:00:00.000Z'),
              to: new Date('2026-12-31T00:00:00.000Z'),
            },
            licenseSlug: 'starter',
            metadata: {},
            name: 'Acme Instance',
          },
        }),
    };
  },
}));

vi.mock('@/domains/crm-sync', () => ({
  startAttioSyncWatcher: (...args: unknown[]) =>
    startAttioSyncWatcherSpy(...args),
}));

vi.mock('@/functionals/stacked-form-dialog', () => ({
  StackedFormDialogDirtyState: () => null,
  useStackedFormDialogClose: () => undefined,
  StackedFormDialogCard: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

vi.mock('@/functionals/step-stack', () => ({
  StepStack: ({ children }: { children: React.ReactNode }) => children,
  StepStackContainer: ({ children }: { children: React.ReactNode }) => children,
  StepStackPrevious: ({ children }: { children: React.ReactNode }) => children,
  StepStackStep: ({ children }: { children: React.ReactNode }) => children,
  useStepStack: () => ({
    nextStep: vi.fn(),
  }),
}));

vi.mock('./instance-form-sections', () => ({
  InstanceInformationFields: (props: unknown) => {
    instanceInformationFieldsSpy(props);
    return <div>info</div>;
  },
  InstanceLicenseFields: () => <div>license</div>,
  InstanceDeploymentFields: () => <div>deployment</div>,
  InstanceMetadataFields: () => <div>metadata</div>,
}));

vi.mock('../../hooks/instance-query-invalidation', () => ({
  invalidateInstanceQueries: vi.fn(),
  invalidateInstancesListQueries: (...args: unknown[]) =>
    invalidateInstancesListQueriesSpy(...args),
}));

describe('InstanceForm', () => {
  beforeEach(() => {
    capturedFormOptions = undefined as never;
    createMutationSpy.mockReset();
    setQueryDataSpy.mockReset();
    invalidateInstancesListQueriesSpy.mockReset();
    instanceInformationFieldsSpy.mockReset();
    listCustomersOptionsSpy.mockReset();
    mockRouterNavigate.mockReset();
    startAttioSyncWatcherSpy.mockReset();
    toastSuccessSpy.mockReset();
  });

  // PATCH /instances rejects an empty lifecycleStage (minLength 1) and reads an
  // omitted one as "keep the current", so an emptied field must not
  // reach it. Both mutations go through the same mocked useMutation, so the
  // call count is what says whether the PATCH was emitted.
  describe('lifecycle stage on update', () => {
    const existingInstance = {
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: { id: 'user-1', name: 'User 1' },
      customerId: 'customer-1',
      customerSlug: 'acme',
      description: 'Acme production',
      endLicenseDate: '2026-12-31T00:00:00.000Z',
      id: 'instance-1',
      licenseId: 'license-1',
      licenseSlug: 'starter',
      lifecycleStage: 'ACTIVE',
      metadata: {},
      name: 'Acme Instance',
      slug: 'acme-instance',
      startLicenseDate: '2026-01-01T00:00:00.000Z',
      status: 'HEALTHY',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: { id: 'user-1', name: 'User 1' },
    } as never;

    const submitWithStage = async (lifecycleStage: string) => {
      render(<InstanceForm instance={existingInstance} onSuccess={vi.fn()} />);

      await capturedFormOptions.onSubmit({
        value: {
          customerId: 'customer-1',
          deploymentZoneId: '',
          description: 'Acme production',
          licenseDate: {
            from: new Date('2026-01-01T00:00:00.000Z'),
            to: new Date('2026-12-31T00:00:00.000Z'),
          },
          licenseSlug: 'starter',
          lifecycleStage,
          metadata: {},
          name: 'Acme Instance',
        },
      });
    };

    it('does not patch when the stage has been emptied', async () => {
      await submitWithStage('');

      // The PUT alone: no follow-up PATCH carrying an empty stage.
      expect(createMutationSpy).toHaveBeenCalledTimes(1);
    });

    it('patches when the stage changed to a real value', async () => {
      await submitWithStage('CHURNED');

      expect(createMutationSpy).toHaveBeenCalledTimes(2);
      expect(createMutationSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: { lifecycleStage: 'CHURNED' } }),
      );
      // Confirmed once, after the PATCH as well.
      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'Pages.Customers.Instances.Mutation.Form.updateSuccess',
      );
    });
  });

  it('prefills and locks the customer in the customer-scoped create flow', async () => {
    render(
      <InstanceForm
        lockedCustomer={{ id: 'customer-1', name: 'Acme Corp' }}
        onSuccess={vi.fn()}
      />,
    );

    expect(capturedFormOptions.defaultValues.customerId).toBe('customer-1');
    expect(listCustomersOptionsSpy).not.toHaveBeenCalled();
    expect(instanceInformationFieldsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        customerFieldDisabled: true,
      }),
    );

    await capturedFormOptions.onSubmit({
      value: {
        customerId: 'customer-1',
        description: 'Acme production',
        licenseDate: {
          from: new Date('2026-01-01T00:00:00.000Z'),
          to: new Date('2026-12-31T00:00:00.000Z'),
        },
        licenseSlug: 'starter',
        metadata: { tier: 'gold' },
        name: 'Acme Instance',
      },
    });

    expect(createMutationSpy).toHaveBeenCalledWith({
      body: {
        customerId: 'customer-1',
        deploymentZoneId: undefined,
        description: 'Acme production',
        endLicenseDate: '2026-12-31T00:00:00.000Z',
        licenseId: 'license-1',
        metadata: { tier: 'gold' },
        name: 'Acme Instance',
        slug: undefined,
        startLicenseDate: '2026-01-01T00:00:00.000Z',
      },
    });
    // Cached for the page creation lands on, so its route does not fetch it.
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['getInstance', { path: { instanceSlug: 'acme-instance' } }],
      { integrations: {}, slug: 'acme-instance' },
    );
    expect(invalidateInstancesListQueriesSpy).toHaveBeenCalled();
    expect(startAttioSyncWatcherSpy).toHaveBeenCalledWith({
      queryClient: mockQueryClient,
      entityKind: 'instance',
      entitySlug: 'acme-instance',
      integrations: {},
    });
    expect(toastSuccessSpy).toHaveBeenCalledWith(
      'Pages.Customers.Instances.Mutation.Form.createSuccess',
    );
  });
});
