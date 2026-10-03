import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse } from 'msw/http';
import { server } from '@/__tests__/msw-server';
import { handleDeleteCustomer, handleGetCustomer } from '@/api-client/msw.gen';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { customerQueryOptions } from '../../queries/customer-query-options';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { CustomerDetailPageContent } from '../customer-detail-page-content';

let crmSyncCardVisible = false;
const mockNavigate = vi.fn();

const mockRouterNavigate = vi.fn();
let queryClient: QueryClient;
let instances: unknown[];
let deleted = false;
let detailReads = 0;

const customer = { createdAt: '2026-02-24T00:00:00.000Z', externalCustomerId: 'ext-1',
  id: 'customer-1', name: 'Acme Corp', slug: 'acme', updatedAt: '2026-02-25T00:00:00.000Z' };

function renderDetail() {
  return render(<QueryClientProvider client={queryClient}>
    <CustomerDetailPageContent customerSlug="acme" />
  </QueryClientProvider>);
}

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
    queryClient,
  }),
  useSearch: () => ({}),
}));

vi.mock('@/components/destructive-action-button', () => ({
  DestructiveActionButton: ({
    disabled,
    disabledReason,
    label,
    onConfirm,
  }: {
    disabled?: boolean;
    disabledReason?: string;
    label: string;
    onConfirm: () => void;
  }) => (
    <button type="button" disabled={disabled} title={disabledReason} onClick={onConfirm}>
      {label}
    </button>
  ),
}));

vi.mock('@/domains/crm-sync', () => ({
  AttioSyncCard: () => null,
  startAttioSyncWatcher: vi.fn(),
  useAttioSyncCardVisible: () => crmSyncCardVisible,
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
  beforeEach(async () => {
    crmSyncCardVisible = false;
    deleted = false;
    detailReads = 0;
    instances = [
      { customer: { slug: 'acme' }, endLicenseDate: '2026-12-31T00:00:00.000Z', license: { name: 'Community', type: 'TRIAL' },
        lifecycleStage: 'AT_RISK', name: 'Instance A', slug: 'instance-a', startLicenseDate: '2026-01-01T00:00:00.000Z', status: 'DEGRADED' },
      { customer: { slug: 'other-corp' }, endLicenseDate: '2026-12-31T00:00:00.000Z', license: { name: 'Community', type: 'TRIAL' },
        name: 'Other customer instance', slug: 'instance-other', startLicenseDate: '2026-01-01T00:00:00.000Z' },
    ];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    server.use(handleGetCustomer(() => {
      detailReads++;
      return deleted ? new HttpResponse(null, { status: 404 }) : HttpResponse.json(customer);
    }), handleDeleteCustomer(() => { deleted = true; return new HttpResponse(null, { status: 204 }); }),
    graphqlOperationHandler({ GetInstancesWithRelations: () => ({ instances: { hasMore: false, items: instances } }) }));
    await queryClient.fetchQuery(customerQueryOptions('acme'));
    mockNavigate.mockReset().mockResolvedValue(undefined);
    mockRouterNavigate.mockClear();
  });

  it('uses a two-column layout only when the Attio card is visible', () => {
    const hiddenView = renderDetail();
    expect(
      hiddenView.container.querySelector('.lg\\:grid-cols-2'),
    ).not.toBeInTheDocument();

    hiddenView.unmount();
    crmSyncCardVisible = true;

    const visibleView = renderDetail();
    expect(
      visibleView.container.querySelector('.lg\\:grid-cols-2'),
    ).toBeInTheDocument();
  });

  it('renders the instance table with each name linking to its instance', async () => {
    renderDetail();
    await screen.findByRole('link', { name: 'Instance A' });

    expect(
      screen.queryByText('Other customer instance'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Instance A' })).toHaveAttribute(
      'href',
      '/customers/instances/instance-a',
    );
  });

  it('gives the blocked delete the same reason as the list', async () => {
    renderDetail();
    await screen.findByRole('link', { name: 'Instance A' });

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute(
      'title',
      'Some instances are still associated with this customer.',
    );
  });

  it('shows each instance status and lifecycle stage, like the instances list', async () => {
    renderDetail();
    await screen.findByRole('link', { name: 'Instance A' });

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
    renderDetail();

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
    instances = [];
    const view = renderDetail();
    mockNavigate.mockImplementation(async () => {
      expect(deleted).toBe(true);
      expect(queryClient.getQueryData(customerQueryOptions('acme').queryKey)).toEqual(customer);
      view.unmount();
    });
    const button = screen.getByRole('button', { name: 'Delete' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.setup().click(button);
    await waitFor(() => expect(queryClient.getQueryData(customerQueryOptions('acme').queryKey)).toBeUndefined());
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/customers' });
    expect(detailReads).toBe(1);
  });

  it('navigates to the customer-scoped instance creation route from the instances card', async () => {
    const user = userEvent.setup();

    renderDetail();

    await user.click(screen.getByRole('button', { name: 'New Instance' }));

    expect(mockNavigate).toHaveBeenCalledWith({
      params: { customerSlug: 'acme' },
      to: '/customers/$customerSlug/instances/new',
    });
  });
});
