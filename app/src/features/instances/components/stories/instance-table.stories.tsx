import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import { storyInstanceRows } from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstancesTable } from '../instance-table';

// InstancesTable soft-fetches the active INSTANCE metadata fields over GraphQL.
// Seed none: the story stays off the network and keeps the raw-JSON metadata
// column, whose dialog the Default story shows. Declared fields would turn the
// rows' region and tier into typed columns and drop that dialog.
const seedInstanceTableQueries = (queryClient: QueryClient) => {
	queryClient.setQueryData(
		metadataFieldsActiveQueryOptions('INSTANCE').queryKey,
		[],
	);
};

const meta = {
	title: 'Features/Instances/InstanceTable',
	component: InstancesTable,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof InstancesTable>;

export default meta;
type Story = StoryObj<typeof InstancesTable>;

const renderTable = (instances = storyInstanceRows) => (
	<StorybookRouter seed={seedInstanceTableQueries}>
		<div className="min-h-screen p-6">
			<InstancesTable instances={instances} />
		</div>
	</StorybookRouter>
);

export const Default: Story = {
	render: () => renderTable(),
	parameters: {
		docs: {
			description: {
				story:
					'Instance table with customer and license relations, metadata dialog, deleted row styling and row actions.',
			},
		},
	},
};

export const Empty: Story = {
	render: () => renderTable([]),
	parameters: {
		docs: {
			description: {
				story: 'Empty instance table with the create action available.',
			},
		},
	},
};
