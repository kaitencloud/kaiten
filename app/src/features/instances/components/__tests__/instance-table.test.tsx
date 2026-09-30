import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { InstanceStatus } from '@/domains/customer-management';
import { InstancesTable } from '../instance-table';

// The table reads the active MetadataField list to decide
// between typed columns/filters and the legacy raw-JSON column. Tests
// drive the underlying query result by mutating `metadataFieldsStub`
// before render.
const metadataFieldsStub = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/domains/metadata-fields', () => ({
  metadataFieldsActiveQueryOptions: () => ({
    queryFn: async () => metadataFieldsStub.rows,
    queryKey: ['stub', 'metadata-fields', 'INSTANCE'],
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({
    buildLocation: ({ params }: { params: { instanceSlug: string } }) => ({
      pathname: `/customers/instances/${params.instanceSlug}`,
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// `<GradientButton>` renders a styled link; for the unit test a stub
// keeps the DOM small and predictable.
vi.mock('@/components/gradient-button', () => ({
  GradientButton: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('../instance-table-actions', () => ({
  InstanceTableActions: () => <span>actions</span>,
}));

type FakeInstance = {
  id: string;
  name: string;
  slug: string;
  description: string;
  customer: { name: string };
  license: { name: string };
  metadata: Record<string, unknown> | null;
  status: InstanceStatus;
};

const baseInstance: FakeInstance = {
  customer: { name: 'Acme' },
  description: 'A test instance',
  id: 'inst-1',
  license: { name: 'Pro' },
  status: 'HEALTHY',
  metadata: {
    region: 'eu',
    legacyHost: 'legacy.example.com',
  },
  name: 'Production EU',
  slug: 'prod-eu',
};

function renderTable(instances: FakeInstance[] = [baseInstance]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InstancesTable
        instances={
          instances as unknown as React.ComponentProps<
            typeof InstancesTable
          >['instances']
        }
      />
    </QueryClientProvider>,
  );
}

describe('InstancesTable', () => {
  beforeEach(() => {
    metadataFieldsStub.rows = [];
  });

  // Schema absent keeps the legacy "Metadata" column.
  it('shows the legacy raw-JSON Metadata column when no schema is declared', async () => {
    renderTable();

    expect(await screen.findByText('Metadata')).toBeInTheDocument();
    // Typed Region column header should NOT be there.
    expect(screen.queryByText('Region')).not.toBeInTheDocument();
    // Extra metadata column is not rendered in the no-schema branch.
    expect(screen.queryByText('Extra metadata')).not.toBeInTheDocument();
  });

  // When schemas exist, the typed column appears AND
  // an Extra metadata column carries orphan keys (here `legacyHost`).
  it('renders one typed column per active field + an Extra metadata column for orphans', async () => {
    metadataFieldsStub.rows = [
      {
        archivedAt: null,
        displayOrder: 0,
        id: 'field-region',
        jsonSchema: { type: 'string', enum: ['eu', 'us'] },
        key: 'region',
        label: 'Region',
        resourceType: 'INSTANCE',
      },
    ];

    renderTable();

    expect(await screen.findByText('Region')).toBeInTheDocument();
    expect(await screen.findByText('Extra metadata')).toBeInTheDocument();
    // Legacy raw-JSON column header is suppressed when the schema is on.
    expect(screen.queryByText('Metadata')).not.toBeInTheDocument();
  });

  // A fully-declared table stays clean: when every metadata key maps to an
  // active field there are no orphans, so the Extra metadata column is omitted.
  it('omits the Extra metadata column when every key maps to an active field', async () => {
    metadataFieldsStub.rows = [
      {
        archivedAt: null,
        displayOrder: 0,
        id: 'field-region',
        jsonSchema: { type: 'string', enum: ['eu', 'us'] },
        key: 'region',
        label: 'Region',
        resourceType: 'INSTANCE',
      },
    ];

    renderTable([{ ...baseInstance, metadata: { region: 'eu' } }]);

    expect(await screen.findByText('Region')).toBeInTheDocument();
    expect(screen.queryByText('Extra metadata')).not.toBeInTheDocument();
  });
});
