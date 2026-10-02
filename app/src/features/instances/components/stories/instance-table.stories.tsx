import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyInstanceRows } from '@/test-fixtures/storybook-fixtures';
import { metadataFieldsHandler } from '@/test-fixtures/storybook-handlers';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstancesTable } from '../instance-table';

const meta = {
	title: 'Features/Instances/InstanceTable',
	component: InstancesTable,
	parameters: {
		layout: 'fullscreen',
		msw: {
			// InstancesTable soft-fetches the active INSTANCE metadata fields over
			// GraphQL. None is declared: the story keeps the raw-JSON metadata
			// column, whose dialog the Default story shows. Declared fields would
			// turn the rows' region and tier into typed columns and drop that
			// dialog.
			handlers: [metadataFieldsHandler()],
		},
	},
	tags: ['autodocs'],
} satisfies Meta<typeof InstancesTable>;

export default meta;
type Story = StoryObj<typeof InstancesTable>;

const renderTable = (instances = storyInstanceRows) => (
	<StorybookRouter>
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
