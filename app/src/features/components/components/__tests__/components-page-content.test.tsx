import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ComponentsPageContent } from '../components-page-content';

let currentPath = '/releases/components';

const { navigateMock, useSuspenseQueryMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useSuspenseQueryMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useSuspenseQuery: useSuspenseQueryMock,
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
      className={className}
      data-params={JSON.stringify(params)}
      data-to={to}
      href={to}
    >
      {children}
    </a>
  ),
  useLocation: ({
    select,
  }: {
    select?: (location: { pathname: string }) => unknown;
  } = {}) => {
    const location = {
      pathname: currentPath,
    };

    return select ? select(location) : location;
  },
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    init: () => undefined,
    type: '3rdParty',
  },
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: 'en-US',
    },
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      if (key === 'Pages.Releases.Components.Table.releaseCount') {
        const values = (options ?? {}) as { count?: number };
        const count = values.count ?? 0;
        return `${count} release${count === 1 ? '' : 's'}`;
      }

      if (key === 'Pages.Releases.Components.Table.versionCount') {
        const values = (options ?? {}) as { count?: number };
        const count = values.count ?? 0;
        return `${count} version${count === 1 ? '' : 's'}`;
      }

      if (key === 'Pages.Releases.Components.Table.versionsOf') {
        const values = (options ?? {}) as { name?: string };
        return `Versions of ${values.name ?? 'Unknown component'}`;
      }

      if (key === 'Pages.Releases.Components.Dialog.title') {
        const values = (options ?? {}) as { name?: string };
        return `Releases for ${values.name ?? 'Unknown component'}`;
      }

      const translations: Record<string, string> = {
        'Common.actions': 'Actions',
        'Common.addFilter': 'Add filter',
        'Common.advancedFilter': 'Advanced filter',
        'Common.all': 'All',
        'Common.and': 'and',
        'Common.clearFilter': 'Clear filter',
        'Common.clearRules': 'Clear rules',
        'Common.deleteRule': 'Delete rule',
        'Common.falseValue': 'False',
        'Common.filter': 'Filter',
        'Common.filterBy': 'Filter by:',
        'Common.filterFieldPlaceholder': 'Filter {{field}}...',
        'Common.firstPage': 'First page',
        'Common.lastPage': 'Last page',
        'Common.next': 'Next',
        'Common.noFilterAvailable': 'No filter available',
        'Common.noResults': 'No results',
        'Common.or': 'or',
        'Common.previous': 'Previous',
        'Common.removeFilterForField': 'Remove {{field}} filter',
        'Common.reset': 'Reset',
        'Common.rowsPerPage': 'Rows per page',
        'Common.trueValue': 'True',
        'Common.where': 'Where',
        'Features.Releases.Status.deployed': 'Deployed',
        'Features.Releases.Status.planned': 'Planned',
        'Features.Releases.Status.staging': 'Staging',
        'Features.Releases.Status.superseded': 'Superseded',
        'Pages.Releases.Components.Stats.releasesUsingComponents':
          'Releases Using Components',
        'Pages.Releases.Components.Stats.sharedAcrossReleases':
          'Shared Across Releases',
        'Pages.Releases.Components.Stats.totalComponents': 'Total Components',
        'Pages.Releases.Components.Stats.versionedComponents':
          'Versioned Components',
        'Pages.Releases.Components.Dialog.Columns.created': 'Created',
        'Pages.Releases.Components.Dialog.Columns.release': 'Release',
        'Pages.Releases.Components.Dialog.Columns.status': 'Status',
        'Pages.Releases.Components.Dialog.description':
          'List of all releases that include this component',
        'Pages.Releases.Components.subtitle':
          'Browse and create versioned components across your platform, including those linked to releases',
        'Pages.Releases.Components.Actions.create': 'Create Component',
        'Pages.Releases.Components.Table.Columns.createdAt': 'Created',
        'Pages.Releases.Components.Table.Columns.createdBy': 'Created by',
        'Pages.Releases.Components.Table.Columns.name': 'Name',
        'Pages.Releases.Components.Table.Columns.releases': 'Releases',
        'Pages.Releases.Components.Table.Columns.version': 'Version',
        'Pages.Releases.Components.Table.empty':
          'No components yet. Create one to get started.',
        'Pages.Releases.Components.fallback.unknownUser': 'Unknown user',
        'Pages.Releases.Components.title': 'Components',
        'Pages.Releases.tabs.components': 'Components',
        'Pages.Releases.tabs.deploymentZones': 'Deployment Zones',
        'Pages.Releases.tabs.releases': 'Releases',
      };

      return translations[key] ?? key;
    },
  }),
}));

const releaseAuthor = {
  id: 'user-1',
  name: 'Jane Doe',
};

const componentsData = [
  {
    createdAt: '2026-03-01T10:00:00.000Z',
    createdBy: releaseAuthor,
    description: 'API used for billing flows.',
    id: 'component-billing',
    name: 'Billing API',
    previousComponentId: 'component-billing-previous',
    slug: 'billing-api-1-2-3',
    version: '1.2.3',
  },
  {
    createdAt: '2026-04-01T10:00:00.000Z',
    createdBy: releaseAuthor,
    description: 'Adds usage-based invoices.',
    id: 'component-billing-1-3-0',
    name: 'Billing API',
    slug: 'billing-api-1-3-0',
    version: '1.3.0',
  },
  {
    createdAt: '2026-03-02T10:00:00.000Z',
    createdBy: releaseAuthor,
    description: 'CLI for support workflows.',
    id: 'component-cli',
    name: 'Support CLI',
    slug: 'support-cli-2-0-0',
    version: '2.0.0',
  },
  {
    createdAt: '2026-03-03T10:00:00.000Z',
    createdBy: releaseAuthor,
    description: 'Standalone UI shell for the customer portal.',
    id: 'component-portal',
    name: 'Portal UI',
    slug: 'portal-ui-0-9-0',
    version: '0.9.0',
  },
];

// A zone as the overview lists it under a release: the zones the release ever
// reached, each carrying the release it runs NOW.
const zoneRunning = (id: string, type: string, releaseId: string) => ({
  id,
  releaseId,
  type,
});

const releaseData = [
  {
    components: [componentsData[0], componentsData[2]],
    createdAt: '2026-03-05T10:00:00.000Z',
    createdBy: releaseAuthor,
    deploymentZones: [zoneRunning('zone-production', 'production', 'release-march')],
    description: 'March release',
    id: 'release-march',
    slug: 'release-2026-03',
    updatedAt: '2026-03-05T10:00:00.000Z',
    updatedBy: releaseAuthor,
    version: 'Release 2026.03',
  },
  {
    components: [componentsData[0], componentsData[1]],
    createdAt: '2026-04-05T10:00:00.000Z',
    createdBy: releaseAuthor,
    deploymentZones: [zoneRunning('zone-staging', 'staging', 'release-april')],
    description: 'April release',
    id: 'release-april',
    slug: 'release-2026-04',
    updatedAt: '2026-04-05T10:00:00.000Z',
    updatedBy: releaseAuthor,
    version: 'Release 2026.04',
  },
];

// The page reads the components and the overview, and nothing else: the REST
// zones say what runs now, never what ran.
const mockQueries = (releases: unknown[], components = componentsData) =>
  useSuspenseQueryMock.mockImplementation(({ queryKey }) => {
    if (queryKey?.[0]?._id === 'listComponents') {
      return { data: { hasMore: false, items: components } };
    }

    if (
      queryKey?.[0] === 'releases' &&
      queryKey?.[1] === 'management-overview'
    ) {
      return { data: releases };
    }

    throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
  });

const getStatValue = (label: string) => {
  const card = screen.getByText(label).closest('[data-slot="stat-card"]');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected the "${label}" stat card`);
  }

  return within(card).getByText(/^\d+$/).textContent;
};

describe('ComponentsPageContent', () => {
  beforeEach(() => {
    currentPath = '/releases/components';
    navigateMock.mockReset();
    useSuspenseQueryMock.mockReset();
    mockQueries(releaseData);
  });

  it('renders the components catalog, stats, and compact release counts', () => {
    render(<ComponentsPageContent />);

    expect(
      screen.getByRole('heading', { name: 'Components' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Browse and create versioned components across your platform, including those linked to releases',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Total Components')).toBeInTheDocument();
    expect(screen.getByText('Billing API')).toBeInTheDocument();
    expect(screen.getByText('Support CLI')).toBeInTheDocument();
    expect(screen.getByText('Portal UI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Components' })).toHaveClass(
      'bg-background',
    );
    expect(
      screen.getByRole('button', { name: 'Create Component' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '2 releases' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '1 release' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Release 2026.04' }),
    ).not.toBeInTheDocument();
  });

  it('shows each component once, as its latest version, and counts components', () => {
    render(<ComponentsPageContent />);

    expect(screen.getAllByText('Billing API')).toHaveLength(1);
    expect(screen.getByText('1.3.0')).toBeInTheDocument();
    expect(screen.getByText('2 versions')).toBeInTheDocument();
    expect(screen.getByText('Adds usage-based invoices.')).toBeInTheDocument();
    expect(screen.queryByText('1.2.3')).not.toBeInTheDocument();

    expect(getStatValue('Total Components')).toBe('3');
    expect(getStatValue('Versioned Components')).toBe('1');
    expect(getStatValue('Shared Across Releases')).toBe('1');
    expect(getStatValue('Releases Using Components')).toBe('2');
  });

  it('lists a component\'s versions under it once expanded', async () => {
    const user = userEvent.setup();

    render(<ComponentsPageContent />);

    const toggle = screen.getByRole('button', {
      name: 'Versions of Billing API',
    });
    const componentRow = toggle.closest('tr');

    if (!componentRow) {
      throw new Error('Expected the component row');
    }

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // A component with a single version has nothing to expand.
    expect(
      screen.queryByRole('button', { name: 'Versions of Support CLI' }),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('API used for billing flows.')).toBeInTheDocument();
    // Each version carries its own releases: 1.2.3 ships in both, like the
    // component as a whole.
    expect(screen.getAllByRole('button', { name: '2 releases' })).toHaveLength(
      2,
    );
    // The component's row now heads its versions: the latest one's details
    // show once, on that version's own row.
    expect(within(componentRow).getByText('2 versions')).toBeInTheDocument();
    expect(within(componentRow).queryByText('1.3.0')).not.toBeInTheDocument();
    expect(
      within(componentRow).queryByText('Adds usage-based invoices.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('1.3.0')).toHaveLength(1);
    expect(screen.getAllByText('Adds usage-based invoices.')).toHaveLength(1);

    // A click anywhere on the component's row closes it again.
    await user.click(within(componentRow).getByText('Billing API'));

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('1.2.3')).not.toBeInTheDocument();
    expect(
      within(componentRow).getByText('Adds usage-based invoices.'),
    ).toBeInTheDocument();
  });

  it('navigates to the route-driven dialog when creating a component', async () => {
    const user = userEvent.setup();

    render(<ComponentsPageContent />);

    await user.click(screen.getByRole('button', { name: 'Create Component' }));

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/releases/components/new',
    });
  });

  it('filters the table by component name from the search input', async () => {
    const user = userEvent.setup();

    render(<ComponentsPageContent />);

    await user.type(screen.getByPlaceholderText('Name'), 'Billing');

    await waitFor(() => {
      expect(screen.getByText('Billing API')).toBeInTheDocument();
      expect(screen.queryByText('Support CLI')).not.toBeInTheDocument();
    });
  });

  it('opens a dialog with release details and links for a component', async () => {
    const user = userEvent.setup();

    render(<ComponentsPageContent />);

    await user.click(screen.getByRole('button', { name: '2 releases' }));

    expect(
      await screen.findByText('Releases for Billing API'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('List of all releases that include this component'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Release' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Status' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Created' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Deployed')).toBeInTheDocument();
    expect(screen.getByText('Staging')).toBeInTheDocument();
    expect(screen.getByText('Mar 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('Apr 5, 2026')).toBeInTheDocument();

    const aprilReleaseLink = screen.getByRole('link', {
      name: 'Release 2026.04',
    });

    expect(aprilReleaseLink).toHaveAttribute(
      'data-to',
      '/releases/$releaseSlug',
    );
    expect(aprilReleaseLink).toHaveAttribute(
      'data-params',
      JSON.stringify({ releaseSlug: 'release-2026-04' }),
    );
  });

  // March ran on the production zone until April took it over: the zone lists
  // March among its history but now runs April. Nothing runs March, yet it
  // shipped, so it is Superseded -- and so is what /releases shows for it.
  it('reads a release that was replaced everywhere as Superseded, not Planned', async () => {
    const user = userEvent.setup();

    mockQueries([
      {
        ...releaseData[0],
        deploymentZones: [
          zoneRunning('zone-production', 'production', 'release-april'),
        ],
      },
      {
        ...releaseData[1],
        deploymentZones: [
          zoneRunning('zone-production', 'production', 'release-april'),
        ],
      },
      {
        ...releaseData[1],
        createdAt: '2026-05-05T10:00:00.000Z',
        deploymentZones: [],
        id: 'release-may',
        slug: 'release-2026-05',
        version: 'Release 2026.05',
      },
    ]);

    render(<ComponentsPageContent />);

    await user.click(screen.getAllByRole('button', { name: '3 releases' })[0]);

    const dialog = await screen.findByRole('dialog');
    const statusOf = (version: string) => {
      const row = within(dialog).getByText(version).closest('tr');

      if (!row) {
        throw new Error(`Expected the row of ${version}`);
      }

      return within(row).getByText(/^(Deployed|Staging|Superseded|Planned)$/)
        .textContent;
    };

    expect(statusOf('Release 2026.03')).toBe('Superseded');
    expect(statusOf('Release 2026.04')).toBe('Deployed');
    expect(statusOf('Release 2026.05')).toBe('Planned');
  });

  it('shows the empty state when no release exposes components', () => {
    mockQueries([], []);

    render(<ComponentsPageContent />);

    expect(
      screen.getByText('No components yet. Create one to get started.'),
    ).toBeInTheDocument();
  });
});
