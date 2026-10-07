import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import { type ReactElement, Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Customer, License } from '@/api-client';
import { getInstanceQueryKey } from '@/api-client/@tanstack/react-query.gen';
import {
  handleCreateInstance,
  handleGetLicenses,
  handleListCustomers,
  handleListDeploymentZones,
  handlePatchInstance,
  handleUpdateInstance,
} from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { InstanceForm } from './instance-form';

const invalidateInstancesListQueriesSpy = vi.fn();
const mockRouterNavigate = vi.fn();
const instanceInformationFieldsSpy = vi.fn();
const startAttioSyncWatcherSpy = vi.fn();
const toastSuccessSpy = vi.fn();
const toastErrorSpy = vi.fn();
const goToStepSpy = vi.fn();
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

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorSpy(...args),
    success: (...args: unknown[]) => toastSuccessSpy(...args),
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: mockQueryClient }),
  useRouter: () => ({
    navigate: mockRouterNavigate,
  }),
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
    goToStep: (...args: unknown[]) => goToStepSpy(...args),
    nextStep: vi.fn(),
  }),
}));

vi.mock('./instance-form-sections', () => ({
  InstanceInformationFields: (props: unknown) => {
    instanceInformationFieldsSpy(props);
    return <div>info</div>;
  },
  InstanceLicenseFields: () => <div>license</div>,
}));

vi.mock('./instance-form-deployment-fields', () => ({
  InstanceDeploymentFields: () => <div>deployment</div>,
}));

vi.mock('./instance-form-metadata-fields', () => ({
  InstanceMetadataFields: () => <div>metadata</div>,
}));

vi.mock('../../hooks/instance-query-invalidation', () => ({
  invalidateInstanceQueries: vi.fn(),
  invalidateInstancesListQueries: (...args: unknown[]) =>
    invalidateInstancesListQueriesSpy(...args),
}));

const customer = { id: 'customer-1', name: 'Acme Corp' } as Customer;
const license = { id: 'license-1', name: 'Starter', slug: 'starter' } as License;
const growth = { id: 'license-2', name: 'Growth', slug: 'growth' } as License;

type Write =
  | { op: 'create'; body: unknown }
  | { op: 'patch' | 'update'; instanceSlug: string; body: unknown };

/**
 * Serves what the form reads -- the customers, licenses and deployment zones
 * it offers, and the instance metadata fields -- and the writes it sends,
 * which it records in the order the API received them, with the slug and the
 * body each one carried. Counts the reads of the customer list as well.
 */
function serveInstanceApi() {
  const api = { customerListReads: 0, writes: [] as Write[] };

  server.use(
    handleListCustomers(() => {
      api.customerListReads += 1;
      return HttpResponse.json({ hasMore: false, items: [customer] });
    }),
    handleGetLicenses({ body: { hasMore: false, items: [license, growth] } }),
    handleListDeploymentZones({ body: { hasMore: false, items: [] } }),
    // The form soft-fetches the active MetadataField list to decide whether
    // the metadata step exists. Empty here: this suite covers the
    // locked-customer seeding, not the step list.
    graphqlOperationHandler({
      MetadataFields: () => ({
        metadataFields: { hasMore: false, items: [], nextCursor: null },
      }),
    }),
    handleCreateInstance(async ({ request }) => {
      api.writes.push({ op: 'create', body: await request.json() });
      return HttpResponse.json(
        { integrations: {}, slug: 'acme-instance' },
        { status: 201 },
      );
    }),
    handleUpdateInstance(async ({ params, request }) => {
      api.writes.push({
        op: 'update',
        instanceSlug: params.instanceSlug,
        body: await request.json(),
      });
      return new HttpResponse(null, { status: 204 });
    }),
    handlePatchInstance(async ({ params, request }) => {
      api.writes.push({
        op: 'patch',
        instanceSlug: params.instanceSlug,
        body: await request.json(),
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return api;
}

let queryClient: QueryClient;

// The form suspends until the lists it offers have loaded: the mocked
// information section appears once they have.
const renderForm = async (form: ReactElement) => {
  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>{form}</Suspense>
    </QueryClientProvider>,
  );
  await screen.findByText('info');
};

describe('InstanceForm', () => {
  let api: ReturnType<typeof serveInstanceApi>;

  beforeEach(() => {
    capturedFormOptions = undefined as never;
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    api = serveInstanceApi();
    setQueryDataSpy.mockReset();
    invalidateInstancesListQueriesSpy.mockReset();
    instanceInformationFieldsSpy.mockReset();
    mockRouterNavigate.mockReset();
    startAttioSyncWatcherSpy.mockReset();
    toastSuccessSpy.mockReset();
    toastErrorSpy.mockReset();
    goToStepSpy.mockReset();
  });

  // PATCH /instances rejects an empty lifecycleStage (minLength 1) and reads an
  // omitted one as "keep the current", so an emptied field must not
  // reach it. The API records every write it receives, so the list of writes
  // is what says whether the PATCH was emitted.
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
      await renderForm(
        <InstanceForm instance={existingInstance} onSuccess={vi.fn()} />,
      );

      await act(() =>
        capturedFormOptions.onSubmit({
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
        }),
      );
    };

    it('does not patch when the stage has been emptied', async () => {
      await submitWithStage('');

      // The PUT alone: no follow-up PATCH carrying an empty stage.
      expect(api.writes.map(({ op }) => op)).toEqual(['update']);
    });

    it('patches when the stage changed to a real value', async () => {
      await submitWithStage('CHURNED');

      expect(api.writes.map(({ op }) => op)).toEqual(['update', 'patch']);
      expect(api.writes.at(-1)).toEqual({
        op: 'patch',
        instanceSlug: 'acme-instance',
        body: { lifecycleStage: 'CHURNED' },
      });
      // Confirmed once, after the PATCH as well.
      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
      expect(toastSuccessSpy).toHaveBeenCalledWith(
        'Pages.Customers.Instances.Mutation.Form.updateSuccess',
      );
    });
  });

  it('prefills and locks the customer in the customer-scoped create flow', async () => {
    await renderForm(
      <InstanceForm
        lockedCustomer={{ id: 'customer-1', name: 'Acme Corp' }}
        onSuccess={vi.fn()}
      />,
    );

    expect(capturedFormOptions.defaultValues.customerId).toBe('customer-1');
    expect(api.customerListReads).toBe(0);
    expect(instanceInformationFieldsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        customerFieldDisabled: true,
      }),
    );

    await act(() =>
      capturedFormOptions.onSubmit({
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
      }),
    );

    // No deployment zone and no slug: the undefined fields are left out of
    // the JSON the API receives.
    expect(api.writes).toEqual([
      {
        op: 'create',
        body: {
          customerId: 'customer-1',
          description: 'Acme production',
          endLicenseDate: '2026-12-31T00:00:00.000Z',
          licenseId: 'license-1',
          metadata: { tier: 'gold' },
          name: 'Acme Instance',
          startLicenseDate: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    // Cached for the page creation lands on, so its route does not fetch it.
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      getInstanceQueryKey({ path: { instanceSlug: 'acme-instance' } }),
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
  // While the subscription of an instance lives, the API refuses a change of its
  // customer or its license (409 UpdateInstance.BillingActive) and does not say
  // which: the form marks the ones that were changed, and takes the person back
  // to the first of them, since the submit is on the last step.
  describe('the customer and the license of an instance that bills', () => {
    const billedInstance = {
      customerId: 'customer-1',
      customerSlug: 'acme',
      description: 'Acme production',
      endLicenseDate: '2026-12-31T00:00:00.000Z',
      id: 'instance-1',
      licenseId: 'license-1',
      licenseSlug: 'starter',
      metadata: {},
      name: 'Acme Instance',
      slug: 'acme-instance',
      startLicenseDate: '2026-01-01T00:00:00.000Z',
      status: 'HEALTHY',
    } as never;

    const FROZEN_DETAIL =
      'Instance "acme-instance" has a live subscription: its customer and license cannot change until it is canceled';

    const refuseUpdate = (status = 409, code = 'UpdateInstance.BillingActive') =>
      server.use(
        handleUpdateInstance(() =>
          HttpResponse.json(
            { code, detail: FROZEN_DETAIL, status },
            { status },
          ),
        ),
      );

    const submit = async (changes: Record<string, unknown>) => {
      const marked: Array<{ field: string; error: unknown }> = [];
      const formApi = {
        getFieldValue: () => undefined,
        store: { subscribe: () => ({ unsubscribe: () => {} }) },
        setFieldMeta: (
          field: string,
          update: (meta: { errorMap: Record<string, unknown> }) => {
            errorMap: Record<string, unknown>;
          },
        ) => {
          marked.push({ field, error: update({ errorMap: {} }).errorMap.onServer });
        },
      };
      await renderForm(
        <InstanceForm instance={billedInstance} onSuccess={vi.fn()} />,
      );

      await act(() =>
        capturedFormOptions.onSubmit({
          formApi,
          value: {
            customerId: 'customer-1',
            deploymentZoneId: '',
            description: 'Acme production',
            licenseDate: {
              from: new Date('2026-01-01T00:00:00.000Z'),
              to: new Date('2026-12-31T00:00:00.000Z'),
            },
            licenseSlug: 'starter',
            metadata: {},
            name: 'Acme Instance',
            ...changes,
          },
        } as never),
      );

      return marked;
    };

    it('marks the customer that was changed, with the words of the API, and goes back to its step', async () => {
      refuseUpdate();

      const marked = await submit({ customerId: 'customer-2' });

      expect(marked).toEqual([
        {
          error: { code: 'UpdateInstance.BillingActive', message: FROZEN_DETAIL },
          field: 'customerId',
        },
      ]);
      expect(goToStepSpy).toHaveBeenCalledWith(0);
      expect(toastErrorSpy).not.toHaveBeenCalled();
    });

    it('marks the license that was changed, and goes back to the step of the license', async () => {
      refuseUpdate();

      const marked = await submit({ licenseSlug: 'growth' });

      expect(marked.map(({ field }) => field)).toEqual(['licenseSlug']);
      expect(goToStepSpy).toHaveBeenCalledWith(1);
    });

    it('marks both when both were changed, and goes to the first', async () => {
      refuseUpdate();

      const marked = await submit({
        customerId: 'customer-2',
        licenseSlug: 'growth',
      });

      expect(marked.map(({ field }) => field)).toEqual([
        'customerId',
        'licenseSlug',
      ]);
      expect(goToStepSpy).toHaveBeenCalledTimes(1);
      expect(goToStepSpy).toHaveBeenCalledWith(0);
    });

    it('keeps the toast when no frozen field was changed, since there is none to mark', async () => {
      refuseUpdate();

      const marked = await submit({ name: 'Acme Instance EU' });

      expect(marked).toEqual([]);
      expect(goToStepSpy).not.toHaveBeenCalled();
      expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the toast for any other refusal, and marks nothing', async () => {
      refuseUpdate(422, 'UpdateInstance.LicenseArchived');

      const marked = await submit({ licenseSlug: 'growth' });

      expect(marked).toEqual([]);
      expect(goToStepSpy).not.toHaveBeenCalled();
      expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
