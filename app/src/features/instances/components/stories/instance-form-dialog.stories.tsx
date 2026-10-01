import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getLicensesOptions,
  listCustomersOptions,
  listDeploymentZonesOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import {
  storyCustomers,
  storyDeploymentZones,
  storyLicenses,
} from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstanceFormDialog } from '../instance-form/instance-form-dialog';

const seedInstanceFormQueries = (queryClient: QueryClient) => {
  queryClient.setQueryData(listCustomersOptions().queryKey, {
    hasMore: false,
    items: storyCustomers,
  });
  queryClient.setQueryData(getLicensesOptions().queryKey, {
    hasMore: false,
    items: storyLicenses,
  });
  queryClient.setQueryData(listDeploymentZonesOptions().queryKey, {
    hasMore: false,
    items: storyDeploymentZones,
  });
  // No instance metadata field declared: the form keeps its three steps.
  queryClient.setQueryData(
    metadataFieldsActiveQueryOptions('INSTANCE').queryKey,
    [],
  );
};

const meta = {
  title: 'Features/Instances/InstanceFormDialog',
  component: InstanceFormDialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: false, iframeHeight: 820 },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof InstanceFormDialog>;

export default meta;
type Story = StoryObj<typeof InstanceFormDialog>;

function InstanceFormDialogStory({ locked }: { locked?: boolean }) {
  const [open, setOpen] = useState(true);

  return (
    <StorybookRouter seed={seedInstanceFormQueries}>
      <div className="flex min-h-screen items-center justify-center p-6">
        <InstanceFormDialog
          open={open}
          onOpenChange={setOpen}
          lockedCustomer={
            locked
              ? {
                  id: storyCustomers[0].id,
                  name: storyCustomers[0].name,
                }
              : undefined
          }
          onSuccess={() => setOpen(false)}
        />
      </div>
    </StorybookRouter>
  );
}

export const Create: Story = {
  render: () => <InstanceFormDialogStory />,
  parameters: {
    docs: {
      description: {
        story:
          'Create instance dialog with the customer selector, license step and deployment-zone step.',
      },
    },
  },
};

export const CreateForLockedCustomer: Story = {
  render: () => <InstanceFormDialogStory locked />,
  parameters: {
    docs: {
      description: {
        story:
          'Create instance dialog launched from a customer detail page, with the customer preselected and locked.',
      },
    },
  },
};
