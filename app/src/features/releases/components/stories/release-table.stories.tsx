import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useQueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { type FC, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { ReleaseManagementOverviewRelease } from '@/domains/release-management';
import i18n from '@/lib/i18n/config';
import { ReleaseTable } from '../release-overview';

// --- Mock Data ---

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString();

const user = { id: 'user-1', name: 'User 1' };

// A zone as the overview lists it under a release: one the release ever
// reached, carrying the release it runs NOW.
const zone = (
  id: string,
  name: string,
  type: string,
  releaseId: string,
  description: string,
) => ({
  id,
  name,
  slug: id,
  type,
  description,
  releaseId,
  createdAt: lastWeek,
  updatedAt: yesterday,
});

const buildRelease = (
  release: Pick<
    ReleaseManagementOverviewRelease,
    'createdAt' | 'description' | 'id' | 'version'
  > &
    Partial<ReleaseManagementOverviewRelease>,
): ReleaseManagementOverviewRelease => ({
  components: [],
  createdBy: user,
  deploymentZones: [],
  instances: [],
  slug: release.id,
  ...release,
});

// v0.9.0 ran on Production EU until v1.0.0 took it over: it is Superseded.
const mockReleases: ReleaseManagementOverviewRelease[] = [
  buildRelease({
    id: 'rel-0',
    version: 'v0.9.0',
    description: 'Replaced by v1.0.0 on every zone',
    createdAt: lastWeek,
    deploymentZones: [
      zone(
        'zone-1',
        'Production EU',
        'production',
        'rel-1',
        'European production servers',
      ),
    ],
  }),
  buildRelease({
    id: 'rel-1',
    version: 'v1.0.0',
    description: 'Initial release with core features',
    createdAt: lastWeek,
    deploymentZones: [
      zone(
        'zone-1',
        'Production EU',
        'production',
        'rel-1',
        'European production servers',
      ),
      zone(
        'zone-3',
        'Production US',
        'production',
        'rel-1',
        'US production servers',
      ),
    ],
  }),
  buildRelease({
    id: 'rel-2',
    version: 'v1.1.0',
    description: 'Added deployment zones support',
    createdAt: yesterday,
    deploymentZones: [
      zone('zone-2', 'Staging', 'staging', 'rel-2', 'Staging environment'),
    ],
  }),
  buildRelease({
    id: 'rel-3',
    version: 'v2.0.0-beta',
    description: 'Major update with breaking changes',
    createdAt: now,
  }),
];

// --- Router Wrapper (needed for TableActions with useRouteContext) ---

function TableWrapper({
  releases,
}: {
  releases: ReleaseManagementOverviewRelease[];
}) {
  const queryClient = useQueryClient();

  const rootRoute = createRootRoute({
    component: () => (
      <I18nextProvider i18n={i18n}>
        <div className="p-6">
          <ReleaseTable releases={releases} />
        </div>
      </I18nextProvider>
    ),
  });

  const [history] = useState(() =>
    createMemoryHistory({ initialEntries: ['/'] }),
  );

  const [router] = useState(() =>
    createRouter({
      routeTree: rootRoute,
      history,
      context: { queryClient },
    }),
  );

  return <RouterProvider router={router} />;
}

// --- Meta ---

const meta = {
  title: 'Features/Releases/ReleaseTable',
  component: ReleaseTable,
  decorators: [
    (Story: FC) => (
      <div style={{ minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReleaseTable>;

export default meta;
type Story = StoryObj<typeof ReleaseTable>;

// --- Stories ---

export const Default: Story = {
  render: () => <TableWrapper releases={mockReleases} />,
  parameters: {
    docs: {
      description: {
        story:
          'Release table with multiple releases: deployed, in staging, replaced and planned.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('v1.0.0', { exact: true }),
    ).toBeVisible();
    await expect(canvas.getByText('v1.1.0', { exact: true })).toBeVisible();
    await expect(canvas.getByText('v2.0.0-beta', { exact: true })).toBeVisible();
    await expect(canvas.getAllByText('Deployed').length).toBeGreaterThan(0);
    await expect(canvas.getAllByText('Staging').length).toBeGreaterThan(0);
    await expect(canvas.getAllByText('Superseded').length).toBeGreaterThan(0);
    await expect(canvas.getAllByText('Planned').length).toBeGreaterThan(0);
  },
};

export const Empty: Story = {
  render: () => <TableWrapper releases={[]} />,
  parameters: {
    docs: {
      description: {
        story: 'Empty state with no releases.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No results')).toBeVisible();
  },
};

/**
 * Filtering smoke: typing "beta" into the version search isolates the
 * matching release and hides the others. Replaces the deleted Playwright
 * iframe spec.
 */
export const InteractiveFilter: Story = {
  render: () => <TableWrapper releases={mockReleases} />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: typing "beta" filters the table down to the matching version.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const search = await canvas.findByPlaceholderText('Version');
    await userEvent.type(search, 'beta');

    await expect(canvas.getByText('v2.0.0-beta', { exact: true })).toBeVisible();
    await waitFor(() => {
      expect(canvas.queryByText('v0.9.0', { exact: true })).toBeNull();
      expect(canvas.queryByText('v1.0.0', { exact: true })).toBeNull();
      expect(canvas.queryByText('v1.1.0', { exact: true })).toBeNull();
    });
  },
};

export const SingleRelease: Story = {
  render: () => <TableWrapper releases={[mockReleases[1]]} />,
  parameters: {
    docs: {
      description: {
        story: 'Single release deployed to multiple zones.',
      },
    },
  },
};

export const NoDeployments: Story = {
  render: () => (
    <TableWrapper
      releases={mockReleases.map((release) => ({
        ...release,
        deploymentZones: [],
      }))}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Releases with no deployment zones (all show "Not deployed").',
      },
    },
  },
};

export const ManyReleases: Story = {
  render: () => {
    const manyReleases = Array.from({ length: 15 }, (_, i) =>
      buildRelease({
        id: `rel-${i + 1}`,
        version: `v${Math.floor(i / 3) + 1}.${i % 3}.0`,
        description: `Release ${i + 1} - ${['Bug fixes', 'New features', 'Performance improvements', 'Security updates'][i % 4]}`,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        createdBy: { id: `user-${(i % 3) + 1}`, name: `User ${(i % 3) + 1}` },
      }),
    );
    return <TableWrapper releases={manyReleases} />;
  },
  parameters: {
    docs: {
      description: {
        story: 'Table with many releases to test pagination and scrolling.',
      },
    },
  },
};
