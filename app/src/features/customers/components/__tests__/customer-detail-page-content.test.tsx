import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { CustomerDetailPageContent } from '../customer-detail-page-content';

let crmSyncCardVisible = false;
const mockNavigate = vi.fn();

const mockDeleteMutate = vi.fn();
const mockRouterNavigate = vi.fn();
const mockForgetDeletedCustomerQueries = vi.fn();

type DeleteMutationOptions = {
  mutationKey?: string[];
  onSuccess?: () => Promise<void> | void;
};

let capturedDeleteOptions: DeleteMutationOptions | undefined;

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useMutation: (options?: DeleteMutationOptions) => {
      if (options?.mutationKey?.[0] === 'deleteCustomer') {
        capturedDeleteOptions = options;
      }

      return {
        isPending: false,
        mutate: mockDeleteMutate,
        mutateAsync: vi.fn(),
      };
    },
    useSuspenseQuery: () => ({
      data: {
        createdAt: '2026-02-24T00:00:00.000Z',
        externalCustomerId: 'ext-1',
        id: 'customer-1',
        name: 'Acme Corp',
        slug: 'acme',
        updatedAt: '2026-02-25T00:00:00.000Z',
      },
    }),
  };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    params,
    to,
  }: {
    children: ReactNode;
    className?: string;
    params?: unknown;
    to: string;
  }) => (
    <a
      href={to}
      className={className}
      data-params={JSON.stringify(params)}
      data-to={to}
    >
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useRouter: () => ({
    buildLocation: ({ params }: { params: { instanceSlug: string } }) => ({
      pathname: `/customers/instances/${params.instanceSlug}`,
    }),
    navigate: mockRouterNavigate,
  }),
  useRouteContext: () => ({
    queryClient: {
      invalidateQueries: vi.fn(),
    },
  }),
  useSearch: () => ({}),
}));

vi.mock('@/components/destructive-action-button', () => ({
  DestructiveActionButton: ({
    disabled,
    disabledReason,
    label,
  }: {
    disabled?: boolean;
    disabledReason?: string;
    label: string;
  }) => (
    <button type="button" disabled={disabled} title={disabledReason}>
      {label}
    </button>
  ),
}));

vi.mock('@/api-client/@tanstack/react-query.gen', () => ({
  createCustomerMutation: () => ({}),
  deleteCustomerMutation: () => ({ mutationKey: ['deleteCustomer'] }),
  getCustomerOptions: () => ({}),
  updateCustomerMutation: () => ({}),
}));

vi.mock('@/domains/crm-sync', () => ({
  AttioSyncCard: () => null,
  startAttioSyncWatcher: vi.fn(),
  useAttioSyncCardVisible: () => crmSyncCardVisible,
}));

vi.mock('@/domains/customer-management/queries', () => ({
  forgetDeletedCustomerQueries: (...args: unknown[]) =>
    mockForgetDeletedCustomerQueries(...args),
  invalidateCustomerQueries: vi.fn(),
  useInstancesWithRelations: () => ({
    data: {
      instances: {
        items: [
          {
            customer: { slug: 'acme' },
            endLicenseDate: '2026-12-31T00:00:00.000Z',
            license: { name: 'Community', type: 'TRIAL' },
            lifecycleStage: 'AT_RISK',
            name: 'Instance A',
            slug: 'instance-a',
            startLicenseDate: '2026-01-01T00:00:00.000Z',
            status: 'DEGRADED',
          },
          {
            customer: { slug: 'other-corp' },
            endLicenseDate: '2026-12-31T00:00:00.000Z',
            license: { name: 'Community', type: 'TRIAL' },
            name: 'Other customer instance',
            slug: 'instance-other',
            startLicenseDate: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    },
    isFetching: false,
    isPending: false,
  }),
}));

vi.mock('@/domains/crm-sync/queries', () => ({
  useAttioSyncCardVisible: () => crmSyncCardVisible,
}));

vi.mock('@/domains/crm-sync/queries/attio-sync-state', () => ({
  isAttioSyncCardVisible: (syncInfo: unknown, syncState: { status: string }) =>
    Boolean(syncInfo) || syncState.status !== 'idle',
  useCrmSyncState: () => ({ status: 'idle' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      const translations: Record<string, string> = {
        'Common.cancel': 'Cancel',
        'Common.confirm': 'Confirm',
        'Common.confirmDeleteDescription': 'Confirm delete',
        'Common.confirmDeleteTitle': 'Delete',
        'Common.delete': 'Delete',
        'Common.edit': 'Edit',
        'Common.save': 'Save',
        'Pages.Customers.Table.warningDelete':
          'Some instances are still associated with this customer.',
        'Pages.Customers.Detail.customerDetails.description': 'Description',
        'Pages.Customers.Detail.customerDetails.fields.createdAt': 'Created',
        'Pages.Customers.Detail.customerDetails.fields.externalId':
          'External ID',
        'Pages.Customers.Detail.customerDetails.fields.name': 'Name',
        'Pages.Customers.Detail.customerDetails.fields.updatedAt': 'Updated',
        'Pages.Customers.Detail.customerDetails.by': 'by',
        'Pages.Customers.Detail.customerDetails.title': 'Customer details',
        'Pages.Customers.Detail.instances.columns.end': 'End',
        'Pages.Customers.Detail.instances.columns.license': 'License',
        'Pages.Customers.Detail.instances.columns.lifecycle': 'Lifecycle',
        'Pages.Customers.Detail.instances.columns.name': 'Name',
        'Pages.Customers.Detail.instances.columns.start': 'Start',
        'Pages.Customers.Detail.instances.columns.status': 'Status',
        'Pages.Customers.Detail.instances.columns.type': 'Type',
        'Pages.Customers.Detail.instances.description': 'Instances description',
        'Pages.Customers.Detail.instances.empty': 'No instances',
        'Pages.Customers.Detail.instances.title': 'Instances',
        'Pages.Customers.Instances.Mutation.titleNew': 'New Instance',
        'Pages.Customers.Mutation.Form.Labels.customId': 'Custom ID',
        'Pages.Customers.Mutation.Form.Labels.name': 'Name',
      };

      return translations[key] ?? key;
    },
  }),
}));

describe('CustomerDetailPageContent', () => {
  beforeEach(() => {
    crmSyncCardVisible = false;
    capturedDeleteOptions = undefined;
    mockDeleteMutate.mockReset();
    mockForgetDeletedCustomerQueries.mockClear();
    mockNavigate.mockClear();
    mockRouterNavigate.mockClear();
  });

  it('uses a two-column layout only when the Attio card is visible', () => {
    const hiddenView = render(
      <CustomerDetailPageContent customerSlug="acme" />,
    );
    expect(
      hiddenView.container.querySelector('.lg\\:grid-cols-2'),
    ).not.toBeInTheDocument();

    hiddenView.unmount();
    crmSyncCardVisible = true;

    const visibleView = render(
      <CustomerDetailPageContent customerSlug="acme" />,
    );
    expect(
      visibleView.container.querySelector('.lg\\:grid-cols-2'),
    ).toBeInTheDocument();
  });

  it('renders the instance table with each name linking to its instance', () => {
    render(<CustomerDetailPageContent customerSlug="acme" />);

    expect(
      screen.queryByText('Other customer instance'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Instance A' })).toHaveAttribute(
      'href',
      '/customers/instances/instance-a',
    );
  });

  it('gives the blocked delete the same reason as the list', () => {
    render(<CustomerDetailPageContent customerSlug="acme" />);

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute(
      'title',
      'Some instances are still associated with this customer.',
    );
  });

  it('shows each instance status and lifecycle stage, like the instances list', () => {
    render(<CustomerDetailPageContent customerSlug="acme" />);

    expect(
      screen.getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Lifecycle' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
  });

  it('exposes an edit action that opens the configure dialog and an editable name', () => {
    render(<CustomerDetailPageContent customerSlug="acme" />);

    const editLink = screen.getByRole('link', { name: 'Edit' });
    expect(editLink).toHaveAttribute('data-to', '/customers/$customerSlug');

    expect(
      screen.getByRole('button', { name: 'Edit name' }),
    ).toBeInTheDocument();

    // No inline edit on the details card anymore.
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the detail route before reconciling the deleted customer cache', async () => {
    render(<CustomerDetailPageContent customerSlug="acme" />);

    expect(capturedDeleteOptions?.onSuccess).toBeDefined();
    await capturedDeleteOptions?.onSuccess?.();

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/customers' });
    expect(mockForgetDeletedCustomerQueries).toHaveBeenCalledWith(
      expect.anything(),
      'acme',
    );
    // Order is the fix: touching the deleted customer's detail query while this
    // suspense-driven route is still mounted refetches a row the server has
    // dropped, and navigate waits behind those retries.
    expect(mockNavigate.mock.invocationCallOrder[0]!).toBeLessThan(
      mockForgetDeletedCustomerQueries.mock.invocationCallOrder[0]!,
    );
  });

  it('navigates to the customer-scoped instance creation route from the instances card', async () => {
    const user = userEvent.setup();

    render(<CustomerDetailPageContent customerSlug="acme" />);

    await user.click(screen.getByRole('button', { name: 'New Instance' }));

    expect(mockNavigate).toHaveBeenCalledWith({
      params: { customerSlug: 'acme' },
      to: '/customers/$customerSlug/instances/new',
    });
  });
});
