import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { FC } from 'react';
import type { DeploymentZone, Release } from '@/api-client';
import type {
  DeploymentZoneRelations,
  ReleaseManagementOverviewRelease,
} from '@/domains/release-management';
import { metadataFieldsHandler } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import {
  findVisibleByRole,
  findVisibleByText,
} from '@/test-fixtures/storybook-test-utils';
import { DeploymentZoneTable } from '../deployment-zones/deployment-zone-table';

// --- Mock Data ---

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString();

const mockReleases: Release[] = [
  {
    id: 'rel-1',
    version: 'v1.0.0',
    description: 'Initial release',
    createdAt: lastWeek,
    createdBy: { id: 'user-1', name: 'User 1' },
  },
  {
    id: 'rel-2',
    version: 'v1.1.0',
    description: 'Feature update',
    createdAt: yesterday,
    createdBy: { id: 'user-2', name: 'User 2' },
  },
];

const mockDeploymentZones: DeploymentZone[] = [
  {
    id: 'zone-1',
    name: 'Production EU',
    type: 'production',
    description: 'European production servers',
    metadata: { region: 'eu-west-1', cluster: 'prod-eu' },
    releaseId: 'rel-1',
    createdAt: lastWeek,
    updatedAt: yesterday,
    createdBy: { id: 'user-1', name: 'User 1' },
    updatedBy: { id: 'user-2', name: 'User 2' },
  },
  {
    id: 'zone-2',
    name: 'Production US',
    type: 'production',
    description: 'US production servers',
    metadata: { region: 'us-east-1', cluster: 'prod-us' },
    releaseId: 'rel-1',
    createdAt: lastWeek,
    updatedAt: lastWeek,
    createdBy: { id: 'user-1', name: 'User 1' },
    updatedBy: { id: 'user-1', name: 'User 1' },
  },
  {
    id: 'zone-3',
    name: 'Staging',
    type: 'staging',
    description: 'Pre-production environment',
    metadata: { region: 'eu-west-1', cluster: 'staging' },
    releaseId: 'rel-2',
    createdAt: lastWeek,
    updatedAt: now,
    createdBy: { id: 'user-1', name: 'User 1' },
    updatedBy: { id: 'user-1', name: 'User 1' },
  },
  {
    id: 'zone-4',
    name: 'Dev Local',
    type: 'development',
    description: 'Local development environment',
    createdAt: lastWeek,
    updatedAt: lastWeek,
    createdBy: { id: 'user-2', name: 'User 2' },
    updatedBy: { id: 'user-2', name: 'User 2' },
  },
];

// --- Router Wrapper (needed for TableActions with useRouteContext) ---

function TableWrapper({
  deploymentZones,
  releases,
}: {
  deploymentZones: DeploymentZone[];
  releases: Release[];
}) {
  const releaseById = new Map<string, ReleaseManagementOverviewRelease>(
    releases.map((release) => [
      release.id,
      {
        components: [],
        createdAt: release.createdAt,
        createdBy: release.createdBy,
        deploymentZones: [],
        description: release.description,
        id: release.id,
        instances: [],
        slug: release.slug ?? release.version,
        version: release.version,
      } as ReleaseManagementOverviewRelease,
    ]),
  );
  const relationsByZoneId = new Map<string, DeploymentZoneRelations>(
    deploymentZones.map((zone) => [
      zone.id,
      {
        instances: [],
        releases: zone.releaseId
          ? releases
              .filter((release) => release.id === zone.releaseId)
              .map((release) => ({
                createdAt: release.createdAt,
                description: release.description ?? null,
                id: release.id,
                slug: release.slug ?? release.version,
                version: release.version,
              }))
          : [],
      },
    ]),
  );

  return (
    <StorybookRouter>
      <div className="p-6">
        <DeploymentZoneTable
          deploymentZones={deploymentZones}
          releaseById={releaseById}
          releases={releases}
          relationsByZoneId={relationsByZoneId}
          onEdit={() => {}}
          onDeploy={() => {}}
        />
      </div>
    </StorybookRouter>
  );
}

// --- Meta ---

const meta = {
  title: 'Features/Releases/DeploymentZoneTable',
  component: DeploymentZoneTable,
  decorators: [
    (Story: FC) => (
      <div style={{ minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    msw: {
      // No metadata field declared: the table keeps its raw-JSON metadata
      // column, the one InteractiveFeaturesDialog opens.
      handlers: [metadataFieldsHandler()],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DeploymentZoneTable>;

export default meta;
type Story = StoryObj<typeof DeploymentZoneTable>;

// --- Stories ---

export const Default: Story = {
  render: () => (
    <TableWrapper
      deploymentZones={mockDeploymentZones}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Deployment zone table with all zone types (production, staging, development).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Production EU')).toBeVisible();
    await expect(canvas.getAllByText('Staging').length).toBeGreaterThan(0);
    await expect(canvas.getByText('Dev Local')).toBeVisible();
    await expect(canvas.getAllByText('v1.0.0').length).toBeGreaterThan(0);
    await expect(canvas.getAllByText('v1.1.0').length).toBeGreaterThan(0);
    await expect(canvas.getAllByText('Not deployed').length).toBeGreaterThan(
      0,
    );
    await expect(canvas.getAllByText('1 release').length).toBeGreaterThan(0);
  },
};

export const Empty: Story = {
  render: () => <TableWrapper deploymentZones={[]} releases={[]} />,
  parameters: {
    docs: {
      description: {
        story: 'Empty state with no deployment zones.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('No results')).toBeVisible();
  },
};

/**
 * Filtering smoke: typing "Staging" into the name search isolates that zone.
 * Replaces the deleted Playwright iframe spec.
 */
export const InteractiveFilter: Story = {
  render: () => (
    <TableWrapper
      deploymentZones={mockDeploymentZones}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: filtering by zone name keeps only the matching row.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const search = await canvas.findByPlaceholderText('Name');
    await userEvent.type(search, 'Staging');

    await expect(canvas.getAllByText('Staging').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(canvas.queryByText('Production EU')).toBeNull();
    });
  },
};

/**
 * Features dialog smoke: clicking the cell opens the JSON viewer dialog and
 * surfaces the region value. Replaces the deleted Playwright iframe spec.
 */
export const InteractiveFeaturesDialog: Story = {
  render: () => (
    <TableWrapper
      deploymentZones={mockDeploymentZones}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: clicking the features cell opens the JSON viewer dialog.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const trigger = (
      await canvas.findAllByRole('button', { name: 'Metadata Configuration' })
    )[0];
    await userEvent.click(trigger);

    const dialog = await findVisibleByRole(document.body, 'dialog');
    const heading = await findVisibleByRole(dialog, 'heading', {
      name: 'Metadata Configuration',
    });
    await expect(heading).toBeVisible();
    await expect(
      await findVisibleByText(dialog, /"region": "eu-west-1"/),
    ).toBeVisible();
  },
};

export const AllProduction: Story = {
  render: () => {
    const prodZones: DeploymentZone[] = [
      {
        id: 'zone-1',
        name: 'Production EU',
        type: 'production',
        description: 'EU West servers',
        metadata: { region: 'eu-west-1' },
        releaseId: 'rel-1',
        createdAt: lastWeek,
        updatedAt: lastWeek,
        createdBy: { id: 'user-1', name: 'User 1' },
        updatedBy: { id: 'user-1', name: 'User 1' },
      },
      {
        id: 'zone-2',
        name: 'Production US',
        type: 'production',
        description: 'US East servers',
        metadata: { region: 'us-east-1' },
        releaseId: 'rel-1',
        createdAt: lastWeek,
        updatedAt: lastWeek,
        createdBy: { id: 'user-1', name: 'User 1' },
        updatedBy: { id: 'user-1', name: 'User 1' },
      },
      {
        id: 'zone-3',
        name: 'Production APAC',
        type: 'production',
        description: 'Asia Pacific servers',
        metadata: { region: 'ap-southeast-1' },
        releaseId: 'rel-2',
        createdAt: yesterday,
        updatedAt: yesterday,
        createdBy: { id: 'user-2', name: 'User 2' },
        updatedBy: { id: 'user-2', name: 'User 2' },
      },
    ];
    return <TableWrapper deploymentZones={prodZones} releases={mockReleases} />;
  },
  parameters: {
    docs: {
      description: {
        story: 'Multiple production zones with different releases deployed.',
      },
    },
  },
};

export const NoReleasesDeployed: Story = {
  render: () => {
    const zonesWithoutReleases: DeploymentZone[] = mockDeploymentZones.map(
      (z) => ({ ...z, releaseId: undefined }),
    );
    return (
      <TableWrapper
        deploymentZones={zonesWithoutReleases}
        releases={mockReleases}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Zones with no releases deployed (all show "Not deployed").',
      },
    },
  },
};

export const WithRichFeatures: Story = {
  render: () => {
    const zonesWithFeatures: DeploymentZone[] = [
      {
        id: 'zone-1',
        name: 'Production Complex',
        type: 'production',
        description: 'Complex production setup',
        metadata: {
          region: 'eu-west-1',
          cluster: 'prod-main',
          replicas: 3,
          autoscaling: true,
          limits: { cpu: '4', memory: '8Gi' },
        },
        releaseId: 'rel-1',
        createdAt: lastWeek,
        updatedAt: now,
        createdBy: { id: 'user-1', name: 'User 1' },
        updatedBy: { id: 'user-1', name: 'User 1' },
      },
    ];
    return (
      <TableWrapper
        deploymentZones={zonesWithFeatures}
        releases={mockReleases}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Zone with rich features JSON metadata.',
      },
    },
  },
};
