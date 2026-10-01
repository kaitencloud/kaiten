import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { QueryClient } from '@tanstack/react-query';
import type { DeploymentZone } from '@/api-client';
import { listDeploymentZonesOptions } from '@/api-client/@tanstack/react-query.gen';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import { storyDeploymentZones } from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
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

const seedDeploymentZoneFormQueries = (queryClient: QueryClient) => {
  // The type field suggests the types the existing zones already use.
  queryClient.setQueryData(listDeploymentZonesOptions().queryKey, {
    hasMore: false,
    items: storyDeploymentZones,
  });
  // No metadata field declared: the dialog offers raw JSON for the metadata
  // instead of typed fields.
  queryClient.setQueryData(
    metadataFieldsActiveQueryOptions('DEPLOYMENT_ZONE').queryKey,
    [],
  );
};

// --- Router Wrapper (needed for useRouteContext in form hook) ---

function FormWrapper({ deploymentZone }: { deploymentZone?: DeploymentZone }) {
  return (
    <StorybookRouter seed={seedDeploymentZoneFormQueries}>
      <div className="p-6">
        <DeploymentZoneFormDialog
          deploymentZone={deploymentZone}
          open
          onOpenChange={() => {}}
        />
      </div>
    </StorybookRouter>
  );
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
