import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ReleaseDetailOverviewTab } from '../release-detail-overview-tab';
import { ReleaseDetailPageContent } from '../release-detail-page-content';

const {
  navigateMock,
  queryClientMock,
  useNavigateMock,
  useRouterStateMock,
  useSuspenseQueryMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  queryClientMock: {
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  },
  useNavigateMock: vi.fn(() => navigateMock),
  useRouterStateMock: vi.fn(
    ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => string;
    }) => select({ location: { pathname: '/releases/release-1-0-0' } }),
  ),
  useSuspenseQueryMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useMutation: vi.fn(() => ({
      isPending: false,
      mutateAsync: vi.fn(),
    })),
    useSuspenseQuery: useSuspenseQueryMock,
  };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children: ReactNode;
    params?: unknown;
    to: string;
  }) => (
    <a data-params={JSON.stringify(params)} data-to={to} href={to}>
      {children}
    </a>
  ),
  useNavigate: useNavigateMock,
  useRouteContext: () => ({
    queryClient: queryClientMock,
  }),
  useRouterState: useRouterStateMock,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { init: () => undefined, type: '3rdParty' },
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string, fallbackOrOptions?: unknown) => {
      if (typeof fallbackOrOptions === 'string') {
        return fallbackOrOptions;
      }

      const translations: Record<string, string> = {
        'Common.cancel': 'Cancel',
        'Common.confirm': 'Confirm',
        'Common.confirmDeleteDescription': `Delete ${String((fallbackOrOptions as { name?: string })?.name ?? '')}`,
        'Common.confirmDeleteTitle': 'Delete release?',
        'Common.delete': 'Delete',
        'Features.Releases.Status.deployed': 'Deployed',
        'Features.Releases.Status.planned': 'Planned',
        'Features.Releases.Status.staging': 'Staging',
        'Features.Releases.Status.superseded': 'Superseded',
        'Features.Releases.Types.development': 'Development',
        'Features.Releases.Types.production': 'Production',
        'Features.Releases.Types.staging': 'Staging',
        'Pages.Releases.Detail.stats.never': 'Never',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const release = {
  createdAt: '2026-03-27T11:54:00.000Z',
  createdBy: { id: 'user-1', name: 'Ada Vendor' },
  description: 'Initial release with core features',
  id: 'release-1',
  slug: 'release-1-0-0',
  updatedAt: '2026-03-27T11:54:00.000Z',
  updatedBy: { id: 'user-1', name: 'Ada Vendor' },
  version: 'v1.0.0',
};

const releaseManagementOverview = [
  {
    components: [],
    createdAt: '2026-03-27T11:54:00.000Z',
    createdBy: { id: 'user-1', name: 'Ada Vendor' },
    deploymentZones: [
      {
        createdAt: '2026-03-27T12:00:00.000Z',
        description: 'Production EU',
        id: 'zone-production-eu',
        name: 'Production EU',
        releaseId: 'release-1',
        slug: 'production-eu',
        type: 'production',
        updatedAt: '2026-03-29T08:00:00.000Z',
      },
      {
        createdAt: '2026-03-27T12:10:00.000Z',
        description: 'Staging EU',
        id: 'zone-staging-eu',
        name: 'Staging EU',
        releaseId: 'release-1',
        slug: 'staging-eu',
        type: 'staging',
        updatedAt: '2026-03-28T08:00:00.000Z',
      },
    ],
    description: 'Initial release with core features',
    id: 'release-1',
    instances: [],
    slug: 'release-1-0-0',
    version: 'v1.0.0',
  },
];

const restDeploymentZones = [
  {
    createdAt: '2026-03-27T12:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Ada Vendor' },
    description: 'Production EU',
    features: {},
    id: 'zone-production-eu',
    name: 'Production EU',
    releaseId: undefined,
    slug: 'production-eu',
    type: 'production',
    updatedAt: '2026-03-29T08:00:00.000Z',
    updatedBy: { id: 'user-1', name: 'Ada Vendor' },
  },
];

const restLinkedDeploymentZones = [
  {
    ...restDeploymentZones[0],
    releaseId: 'release-1',
  },
];

function renderDetail() {
  return render(
    <ReleaseDetailPageContent release={release} releaseSlug="release-1-0-0">
      <ReleaseDetailOverviewTab />
    </ReleaseDetailPageContent>,
  );
}

function asHTMLElement(element: Element | null): HTMLElement {
  expect(element).not.toBeNull();

  if (!(element instanceof HTMLElement)) {
    throw new Error('Expected an HTMLElement');
  }

  return element;
}

// A type's row shares its label with the badges of the zones listed below
// it, so the row is the element whose whole text is the label and the value.
function expectMetric(container: HTMLElement, label: string, value: string) {
  const row = within(container)
    .getAllByText(label)
    .map((element) => element.closest('div'))
    .find((element) => element?.textContent === `${label}${value}`);

  expect(row).toBeDefined();
}

describe('ReleaseDetailPageContent', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    queryClientMock.cancelQueries.mockReset();
    queryClientMock.getQueryData.mockReset();
    queryClientMock.invalidateQueries.mockReset();
    queryClientMock.setQueryData.mockReset();
    useNavigateMock.mockClear();
    useRouterStateMock.mockClear();
    useSuspenseQueryMock.mockReset();
    useSuspenseQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: any[] }) => {
        if (queryKey?.[0]?._id === 'getReleaseBySlug') {
          return { data: release };
        }

        if (
          queryKey?.[0] === 'releases' &&
          queryKey?.[1] === 'management-overview'
        ) {
          return { data: releaseManagementOverview };
        }

        if (queryKey?.[0]?._id === 'listDeploymentZones') {
          return { data: { hasMore: false, items: restDeploymentZones } };
        }

        throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
      },
    );
  });

  it('renders detail metrics from the release-management overview when REST deployment zones are stale', () => {
    renderDetail();

    expect(
      screen.getByRole('heading', { level: 1, name: 'v1.0.0' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Deployed').length).toBeGreaterThan(0);

    const deploymentZonesStatCard = screen
      .getByText('Deployment zones')
      .closest('[data-slot="card"]');
    const deploymentZonesStatCardElement = asHTMLElement(
      deploymentZonesStatCard,
    );

    expect(
      within(deploymentZonesStatCardElement).getByText('2'),
    ).toBeInTheDocument();

    const footprintCard = screen
      .getByText('Deployment Footprint')
      .closest('[data-slot="card"]');
    const footprintCardElement = asHTMLElement(footprintCard);

    expectMetric(footprintCardElement, 'Linked zones', '2');
    expectMetric(footprintCardElement, 'Production', '1');
    expectMetric(footprintCardElement, 'Staging', '1');
    // One row per type the zones carry: no development zone, no row.
    expect(
      within(footprintCardElement).queryByText('Development'),
    ).not.toBeInTheDocument();
    expect(
      within(footprintCardElement).getByText('Production EU'),
    ).toBeInTheDocument();
    expect(
      within(footprintCardElement).getByText('Staging EU'),
    ).toBeInTheDocument();
    expect(
      within(footprintCardElement).queryByText(
        'No deployment zones are linked to this release yet.',
      ),
    ).not.toBeInTheDocument();
  });

  it('falls back to REST deployment zones when the overview query does not include the current release', () => {
    useSuspenseQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: any[] }) => {
        if (queryKey?.[0]?._id === 'getReleaseBySlug') {
          return { data: release };
        }

        if (
          queryKey?.[0] === 'releases' &&
          queryKey?.[1] === 'management-overview'
        ) {
          return { data: [] };
        }

        if (queryKey?.[0]?._id === 'listDeploymentZones') {
          return { data: { hasMore: false, items: restLinkedDeploymentZones } };
        }

        throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
      },
    );

    renderDetail();

    expect(screen.getAllByText('Deployed').length).toBeGreaterThan(0);

    const deploymentZonesStatCard = screen
      .getByText('Deployment zones')
      .closest('[data-slot="card"]');
    const deploymentZonesStatCardElement = asHTMLElement(
      deploymentZonesStatCard,
    );

    expect(
      within(deploymentZonesStatCardElement).getByText('1'),
    ).toBeInTheDocument();

    const footprintCard = screen
      .getByText('Deployment Footprint')
      .closest('[data-slot="card"]');
    const footprintCardElement = asHTMLElement(footprintCard);

    expectMetric(footprintCardElement, 'Linked zones', '1');
    expectMetric(footprintCardElement, 'Production', '1');
  });

  // The zone ran this release once and runs another now: the overview lists it
  // under this release, carrying the other release's id. The REST zone list says
  // what runs now and nothing of what ran, so it cannot tell this release from
  // one that never shipped.
  it('reads a release that every zone has moved on from as Superseded, not Planned', () => {
    useSuspenseQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: any[] }) => {
        if (queryKey?.[0]?._id === 'getReleaseBySlug') {
          return { data: release };
        }

        if (
          queryKey?.[0] === 'releases' &&
          queryKey?.[1] === 'management-overview'
        ) {
          return {
            data: [
              {
                ...releaseManagementOverview[0],
                deploymentZones: [
                  {
                    ...releaseManagementOverview[0].deploymentZones[0],
                    releaseId: 'release-2',
                  },
                ],
              },
            ],
          };
        }

        if (queryKey?.[0]?._id === 'listDeploymentZones') {
          return {
            data: {
              hasMore: false,
              items: [{ ...restDeploymentZones[0], releaseId: 'release-2' }],
            },
          };
        }

        throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
      },
    );

    renderDetail();

    const header = asHTMLElement(
      screen.getByRole('heading', { level: 1, name: 'v1.0.0' }).parentElement,
    );

    expect(within(header).getByText('Superseded')).toBeInTheDocument();
    expect(screen.queryByText('Planned')).not.toBeInTheDocument();
    expect(screen.queryByText('Deployed')).not.toBeInTheDocument();
  });

  it('reads Planned for a release the overview does not hold and no zone runs', () => {
    useSuspenseQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: any[] }) => {
        if (queryKey?.[0]?._id === 'getReleaseBySlug') {
          return { data: release };
        }

        if (
          queryKey?.[0] === 'releases' &&
          queryKey?.[1] === 'management-overview'
        ) {
          return { data: [] };
        }

        if (queryKey?.[0]?._id === 'listDeploymentZones') {
          return { data: { hasMore: false, items: restDeploymentZones } };
        }

        throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
      },
    );

    renderDetail();

    const header = asHTMLElement(
      screen.getByRole('heading', { level: 1, name: 'v1.0.0' }).parentElement,
    );

    expect(within(header).getByText('Planned')).toBeInTheDocument();
  });

  it('lists the components the release ships', () => {
    render(
      <ReleaseDetailPageContent
        release={{
          ...release,
          components: [
            {
              createdAt: '2026-03-27T11:00:00.000Z',
              createdBy: { id: 'user-1', name: 'Ada Vendor' },
              description: 'Issues invoices',
              id: 'component-billing',
              name: 'Billing Service',
              version: 'v1.0.0',
            },
          ],
        }}
        releaseSlug="release-1-0-0"
      >
        <ReleaseDetailOverviewTab />
      </ReleaseDetailPageContent>,
    );

    const componentsCard = asHTMLElement(
      screen.getByText('Components').closest('[data-slot="card"]'),
    );

    expect(within(componentsCard).getByText('Billing Service')).toBeInTheDocument();
    expect(within(componentsCard).getByText('v1.0.0')).toBeInTheDocument();
    expect(within(componentsCard).getByText('Issues invoices')).toBeInTheDocument();
  });

  it('says when a release ships no component', () => {
    renderDetail();

    expect(
      screen.getByText('This release has no components.'),
    ).toBeInTheDocument();
  });
});
