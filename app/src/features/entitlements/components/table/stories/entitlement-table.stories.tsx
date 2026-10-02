import type { Meta, StoryObj } from '@storybook/react-vite';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { storyEntitlements } from '@/test-fixtures/storybook-fixtures';
import { EntitlementsTable } from '../entitlement-table';

const meta = {
	title: 'Features/Entitlements/EntitlementTable',
	component: EntitlementsTable,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof EntitlementsTable>;

export default meta;
type Story = StoryObj<typeof EntitlementsTable>;

const renderTable = (entitlements = storyEntitlements) => (
	<StorybookRouter>
		<div className="min-h-screen p-6">
			<EntitlementsTable entitlements={entitlements} />
		</div>
	</StorybookRouter>
);

export const Default: Story = {
	render: () => renderTable(),
	parameters: {
		docs: {
			description: {
				story:
					'Entitlement table with groups, entitlement type, meter type, aggregation and row actions.',
			},
		},
	},
};

export const Empty: Story = {
	render: () => renderTable([]),
	parameters: {
		docs: {
			description: {
				story: 'Empty entitlement table state with the create action available.',
			},
		},
	},
};
