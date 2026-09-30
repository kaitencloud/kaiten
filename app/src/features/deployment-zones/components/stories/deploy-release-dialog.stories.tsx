import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useQueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { DeploymentZone, Release } from '@/api-client';
import i18n from '@/lib/i18n/config';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import { DeployReleaseDialog } from '../deployments/deploy-release-dialog';

// --- Mock Data ---

const now = new Date().toISOString();
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString();

const mockReleases: Release[] = [
  {
    id: 'rel-1',
    version: 'v1.0.0',
    description: 'Initial stable release',
    createdAt: lastWeek,
    createdBy: { id: 'user-1', name: 'User 1' },
  },
  {
    id: 'rel-2',
    version: 'v1.1.0',
    description: 'Feature update with deployment zones',
    createdAt: now,
    createdBy: { id: 'user-2', name: 'User 2' },
  },
  {
    id: 'rel-3',
    version: 'v2.0.0-beta',
    description: 'Major update with breaking changes',
    createdAt: now,
    createdBy: { id: 'user-1', name: 'User 1' },
  },
];

const mockZoneWithRelease: DeploymentZone = {
  id: 'zone-1',
  name: 'Production EU',
  type: 'production',
  description: 'European production servers',
  metadata: { region: 'eu-west-1' },
  releaseId: 'rel-1',
  createdAt: lastWeek,
  updatedAt: lastWeek,
  createdBy: { id: 'user-1', name: 'User 1' },
  updatedBy: { id: 'user-1', name: 'User 1' },
};

const mockZoneWithoutRelease: DeploymentZone = {
  id: 'zone-2',
  name: 'Staging',
  type: 'staging',
  description: 'Staging environment',
  createdAt: lastWeek,
  updatedAt: lastWeek,
  createdBy: { id: 'user-1', name: 'User 1' },
  updatedBy: { id: 'user-1', name: 'User 1' },
};

// --- Router Wrapper (needed for useRouteContext in mutation) ---

function DialogWrapper({
  deploymentZone,
  releases,
}: {
  deploymentZone: DeploymentZone;
  releases: Release[];
}) {
  const queryClient = useQueryClient();

  const rootRoute = createRootRoute({
    component: () => (
      <I18nextProvider i18n={i18n}>
        <div className="p-6">
          <DeployReleaseDialog
            deploymentZone={deploymentZone}
            releases={releases}
            open
            onOpenChange={() => {}}
          />
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
  title: 'Features/Releases/DeployReleaseDialog',
  component: DeployReleaseDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DeployReleaseDialog>;

export default meta;
type Story = StoryObj<typeof DeployReleaseDialog>;

// --- Stories ---

export const DeployToEmptyZone: Story = {
  render: () => (
    <DialogWrapper
      deploymentZone={mockZoneWithoutRelease}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Deploy a release to a zone that has no current release.',
      },
    },
  },
  play: async () => {
    // Dialog renders in a portal under document.body.
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const select = await findVisibleByRole(dialog, 'combobox', {
      name: 'Select a release',
    });
    await expect(select).toHaveTextContent(/Choose a release/);
    await expect(
      within(dialog).getByRole('button', { name: 'Deploy' }),
    ).toBeDisabled();
  },
};

export const ChangeRelease: Story = {
  render: () => (
    <DialogWrapper
      deploymentZone={mockZoneWithRelease}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A zone that already has a release opens on it (v1.0.0 pre-selected), and Deploy stays disabled until another release is picked.',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);

    await expect(
      await findVisibleByRole(dialog, 'heading', {
        name: 'Deploy a release to Production EU',
      }),
    ).toBeVisible();
    const select = await findVisibleByRole(dialog, 'combobox', {
      name: 'Select a release',
    });
    await expect(select).toHaveTextContent(/v1\.0\.0/);
    // The running release is the selection, so there is nothing to deploy yet.
    await expect(
      dialogScope.getByRole('button', { name: 'Deploy' }),
    ).toBeDisabled();
  },
};

/**
 * The API reads an omitted `releaseId` as "keep the current release", so the
 * list must not offer an entry that looks like an undeploy: it holds the
 * releases and nothing else.
 */
export const OffersOnlyReleases: Story = {
  render: () => (
    <DialogWrapper
      deploymentZone={mockZoneWithRelease}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A zone that already runs a release: the list holds the releases and no "none" entry, because the API cannot take a zone off its release.',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const select = await findVisibleByRole(dialog, 'combobox', {
      name: 'Select a release',
    });

    await userEvent.click(select);
    const listbox = await findVisibleByRole(document.body, 'listbox');
    const options = within(listbox).getAllByRole('option');

    await expect(options).toHaveLength(mockReleases.length);
    await expect(
      within(listbox).queryByRole('option', { name: /none|undeploy/i }),
    ).not.toBeInTheDocument();
  },
};

/**
 * Switch-release smoke: changing the selection in the combobox updates the
 * displayed value and keeps the Deploy CTA enabled.
 */
export const InteractiveChangeRelease: Story = {
  render: () => (
    <DialogWrapper
      deploymentZone={mockZoneWithRelease}
      releases={mockReleases}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: switching the selected release in the combobox.',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const select = await findVisibleByRole(dialog, 'combobox', {
      name: 'Select a release',
    });

    await userEvent.click(select);
    await userEvent.click(
      await findVisibleByRole(document.body, 'option', {
        name: /v1\.1\.0 - Feature update with deployment zones/,
      }),
    );

    await expect(select).toHaveTextContent(/v1\.1\.0/);
    // Opening the Radix Select marks the parent dialog `aria-hidden`; its
    // accessibility is restored asynchronously once the listbox closes, so
    // wait for the Deploy button to become reachable again instead of
    // querying synchronously.
    const deployButton = await findVisibleByRole(dialog, 'button', {
      name: 'Deploy',
    });
    await expect(deployButton).toBeEnabled();
  },
};

export const SingleRelease: Story = {
  render: () => (
    <DialogWrapper
      deploymentZone={mockZoneWithoutRelease}
      releases={[mockReleases[0]]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Deploy dialog with only one release available.',
      },
    },
  },
};

export const ManyReleases: Story = {
  render: () => {
    const manyReleases: Release[] = Array.from({ length: 20 }, (_, i) => ({
      id: `rel-${i + 1}`,
      version: `v${Math.floor(i / 5) + 1}.${i % 5}.0`,
      description: `Release ${i + 1}`,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      createdBy: { id: 'user-1', name: 'User 1' },
    }));
    return (
      <DialogWrapper
        deploymentZone={mockZoneWithoutRelease}
        releases={manyReleases}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Deploy dialog with many releases to test scrolling in select.',
      },
    },
  },
};
