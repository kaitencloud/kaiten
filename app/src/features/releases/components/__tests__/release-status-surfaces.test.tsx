import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import { DeploymentsPageContent } from '../deployments-page-content';
import { ReleasesPageContent } from '../releases-page-content';

const { useSuspenseQueryMock } = vi.hoisted(() => ({
  useSuspenseQueryMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();

  return {
    ...actual,
    useMutation: vi.fn(() => ({ isPending: false, mutate: vi.fn() })),
    useSuspenseQuery: useSuspenseQueryMock,
  };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: ({
    select,
  }: {
    select?: (location: { pathname: string }) => unknown;
  } = {}) => {
    const location = { pathname: '/releases' };

    return select ? select(location) : location;
  },
  useNavigate: () => vi.fn(),
  useRouteContext: () => ({ queryClient: {} }),
  useRouter: () => ({
    buildLocation: ({ params }: { params: { releaseSlug: string } }) => ({
      pathname: `/releases/${params.releaseSlug}`,
    }),
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// The zones a release reached, each carrying the release it runs NOW.
const zone = (id: string, type: string, releaseId: string) => ({
  createdAt: '2026-03-01T10:00:00.000Z',
  description: `${id} zone`,
  id,
  name: id,
  releaseId,
  slug: id,
  type,
  updatedAt: '2026-03-01T10:00:00.000Z',
});

const release = (
  version: string,
  deploymentZones: ReturnType<typeof zone>[],
) => ({
  components: [],
  createdAt: '2026-03-01T10:00:00.000Z',
  createdBy: { id: 'user-1', name: 'Jane Doe' },
  deploymentZones,
  description: null,
  id: `release-${version}`,
  instances: [],
  slug: `release-${version}`,
  version,
});

// v1 shipped to production, then v2 replaced it there: nothing runs v1 now,
// yet it is not v4, which never shipped.
const overview = [
  release('v1', [zone('production', 'production', 'release-v2')]),
  release('v2', [zone('production', 'production', 'release-v2')]),
  release('v3', [zone('staging', 'staging', 'release-v3')]),
  release('v4', []),
];

const expectedStatuses: Record<string, string> = {
  v1: 'Superseded',
  v2: 'Deployed',
  v3: 'Staging',
  v4: 'Planned',
};

const statusOf = (version: string) => {
  const row = screen.getByText(version, { exact: true }).closest('tr');

  if (!row) {
    throw new Error(`Expected the row of ${version}`);
  }

  return within(row).getByText(/^(Deployed|Staging|Superseded|Planned)$/)
    .textContent;
};

// A card's label is also the name of a status, written in the table below it.
const statValue = (label: string) => {
  const card = screen
    .getAllByText(label)
    .find((element) => element.matches('[data-slot="stat-card-label"]'))
    ?.closest('[data-slot="stat-card"]');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected the "${label}" card`);
  }

  return within(card).getByText(/^\d+$/).textContent;
};

// /releases and /releases/deployments list the same releases. A release has
// one status, whichever list shows it.
describe.each([
  ['/releases', ReleasesPageContent],
  ['/releases/deployments', DeploymentsPageContent],
])('%s', (_path, Page) => {
  beforeEach(() => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
    useSuspenseQueryMock.mockReset();
    // The overview is the only query these pages read.
    useSuspenseQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: unknown[] }) => {
        if (queryKey?.[0] === 'releases' && queryKey?.[1] === 'management-overview') {
          return { data: overview };
        }

        throw new Error(`Unexpected query key: ${JSON.stringify(queryKey)}`);
      },
    );
  });

  it('shows each release with its status, a superseded one included', () => {
    render(<Page />);

    for (const [version, status] of Object.entries(expectedStatuses)) {
      expect(statusOf(version), version).toBe(status);
    }
  });

  it('counts every status in the cards, the four adding up to the total', () => {
    render(<Page />);

    expect(statValue('Total Releases')).toBe('4');
    expect(statValue('Deployed')).toBe('1');
    expect(statValue('In Staging')).toBe('1');
    expect(statValue('Superseded')).toBe('1');
    expect(statValue('Planned')).toBe('1');
  });
});
