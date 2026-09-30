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
import type { DeploymentZone } from '@/api-client';
import i18n from '@/lib/i18n/config';
import {
  findVisibleByRole,
  findVisibleByText,
} from '@/test-fixtures/storybook-test-utils';
import { DeploymentZoneFormDialog } from '../deployment-zones/deployment-zone-form-dialog';

// --- Mock Data ---

const mockDeploymentZone: DeploymentZone = {
  id: 'zone-1',
  name: 'Production EU',
  type: 'production',
  description: 'European production servers',
  metadata: { region: 'eu-west-1', cluster: 'prod-eu' },
  releaseId: 'rel-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: { id: 'user-1', name: 'User 1' },
  updatedBy: { id: 'user-1', name: 'User 1' },
};

// --- Router Wrapper (needed for useRouteContext in form hook) ---

function FormWrapper({ deploymentZone }: { deploymentZone?: DeploymentZone }) {
  const queryClient = useQueryClient();

  const rootRoute = createRootRoute({
    component: () => (
      <I18nextProvider i18n={i18n}>
        <div className="p-6">
          <DeploymentZoneFormDialog
            deploymentZone={deploymentZone}
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
  title: 'Features/Releases/DeploymentZoneFormDialog',
  component: DeploymentZoneFormDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DeploymentZoneFormDialog>;

export default meta;
type Story = StoryObj<typeof DeploymentZoneFormDialog>;

// --- Stories ---

export const Create: Story = {
  render: () => <FormWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Create a new deployment zone with name, type, description and features fields.',
      },
    },
  },
  play: async () => {
    // Dialog renders in a portal under document.body.
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);

    await expect(
      await findVisibleByText(dialog, 'Create Deployment Zone'),
    ).toBeVisible();

    const createButton = await dialogScope.findByRole('button', {
      name: 'Create',
    });
    const nameField = await dialogScope.findByLabelText('Name', {
      exact: true,
    });
    const descriptionField = await dialogScope.findByLabelText('Description', {
      exact: true,
    });

    await expect(createButton).toBeDisabled();

    await userEvent.type(nameField, 'Preview Cluster');
    await userEvent.type(descriptionField, 'Temporary validation environment');

    await expect(createButton).toBeEnabled();
  },
};

export const Edit: Story = {
  render: () => <FormWrapper deploymentZone={mockDeploymentZone} />,
  parameters: {
    docs: {
      description: {
        story: 'Edit an existing deployment zone with pre-filled values.',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);

    await expect(
      await findVisibleByText(dialog, 'Edit Deployment Zone'),
    ).toBeVisible();

    const nameField = await dialogScope.findByLabelText('Name', {
      exact: true,
    });
    const descriptionField = await dialogScope.findByLabelText('Description', {
      exact: true,
    });
    const updateButton = await dialogScope.findByRole('button', {
      name: 'Update',
    });

    await expect(nameField).toHaveValue('Production EU');
    await expect(updateButton).toBeDisabled();

    await userEvent.type(descriptionField, ' and primary traffic');

    await expect(updateButton).toBeEnabled();
  },
};

/**
 * JSON validation smoke: the features field surfaces a validation error
 * when fed malformed JSON.
 */
export const InteractiveJsonValidation: Story = {
  render: () => <FormWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: typing malformed JSON into the features field surfaces "Invalid JSON format".',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);
    // The typed-metadata work renamed the raw-JSON field's label from "Features" to
    // "Metadata". With no active schema declared the dialog still falls
    // back to this raw-JSON textarea, so the validation smoke holds.
    const metadata = await dialogScope.findByLabelText(/^Metadata/);

    metadata.focus();
    await userEvent.type(metadata, 'invalid json');

    await expect(
      await findVisibleByText(dialog, 'Invalid JSON format'),
    ).toBeVisible();
  },
};

export const EditWithoutFeatures: Story = {
  render: () => (
    <FormWrapper
      deploymentZone={{
        ...mockDeploymentZone,
        metadata: undefined,
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Edit a deployment zone that has no features metadata.',
      },
    },
  },
};
