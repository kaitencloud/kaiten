import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyInstanceRows } from '@/test-fixtures/p0-storybook-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { InstancesTable } from '../instance-table';

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
