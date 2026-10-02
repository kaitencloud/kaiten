import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  handleGetLicenses,
  handleListCustomers,
  handleListDeploymentZones,
} from '@/api-client/msw.gen';
import {
  storyCustomers,
  storyDeploymentZones,
  storyLicenses,
} from '@/test-fixtures/storybook-fixtures';
import {
  metadataFieldsHandler,
  onePage,
} from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstanceFormDialog } from '../instance-form/instance-form-dialog';

const meta = {
  title: 'Features/Instances/InstanceFormDialog',
  component: InstanceFormDialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: false, iframeHeight: 820 },
    },
    msw: {
      handlers: [
        handleListCustomers(onePage(storyCustomers)),
        handleGetLicenses(onePage(storyLicenses)),
        handleListDeploymentZones(onePage(storyDeploymentZones)),
        // No instance metadata field declared: the form keeps its three steps.
        metadataFieldsHandler(),
      ],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof InstanceFormDialog>;

export default meta;
type Story = StoryObj<typeof InstanceFormDialog>;

function InstanceFormDialogStory({ locked }: { locked?: boolean }) {
  const [open, setOpen] = useState(true);

  return (
    <StorybookRouter>
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
