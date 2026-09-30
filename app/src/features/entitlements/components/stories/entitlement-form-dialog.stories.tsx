import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { entitlementGroupsQueryOptions } from '../../queries';
import {
  storyEntitlementGroups,
  storyEntitlements,
} from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { EntitlementFormDialog } from '../entitlement-form-dialog';

const seedEntitlementGroups = (queryClient: QueryClient) => {
  queryClient.setQueryData(entitlementGroupsQueryOptions.queryKey, {
    hasMore: false,
    items: storyEntitlementGroups,
  });
};

const meta = {
  title: 'Features/Entitlements/EntitlementFormDialog',
  component: EntitlementFormDialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { inline: false, iframeHeight: 760 },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EntitlementFormDialog>;

export default meta;
type Story = StoryObj<typeof EntitlementFormDialog>;

function EntitlementFormDialogStory({
  entitlement,
}: {
  entitlement?: (typeof storyEntitlements)[number];
}) {
  const [open, setOpen] = useState(true);

  return (
    <StorybookRouter seed={seedEntitlementGroups}>
      <div className="flex min-h-screen items-center justify-center p-6">
        <EntitlementFormDialog
          open={open}
          onOpenChange={setOpen}
          entitlement={entitlement}
          onSuccess={() => setOpen(false)}
        />
      </div>
    </StorybookRouter>
  );
}

export const CreateNumberEntitlement: Story = {
  render: () => <EntitlementFormDialogStory />,
  parameters: {
    docs: {
      description: {
        story:
          'Create entitlement dialog seeded with available entitlement groups.',
      },
    },
  },
};

export const EditBooleanEntitlement: Story = {
  render: () => (
    <EntitlementFormDialogStory entitlement={storyEntitlements[1]} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Edit entitlement dialog showing how non-number entitlements hide meter-specific values.',
      },
    },
  },
};

export const EditNumberEntitlementWithUnits: Story = {
  render: () => (
    <EntitlementFormDialogStory entitlement={storyEntitlements[0]} />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Edit entitlement dialog with the unit section pre-filled: base units, the sold-in-different-units toggle, and the conversion row.',
      },
    },
  },
};
