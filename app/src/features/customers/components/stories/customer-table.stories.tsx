import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { storyCustomerRows } from '@/test-fixtures/storybook-fixtures';
import { CustomersTable } from '../customer-table';

const meta = {
	title: 'Features/Customers/CustomerTable',
	component: CustomersTable,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof CustomersTable>;

export default meta;
type Story = StoryObj<typeof CustomersTable>;

const renderTable = (customers = storyCustomerRows) => (
	<StorybookRouter>
		<div className="min-h-screen p-6">
			<CustomersTable customers={customers} />
		</div>
	</StorybookRouter>
);

export const Default: Story = {
	render: () => renderTable(),
	parameters: {
		docs: {
			description: {
				story:
					'Customer table with external identifiers, license type badges, instance counts, filters and row actions.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText('Acme Corp')).toBeVisible();
		await expect(canvas.getByText('Nova Retail')).toBeVisible();
	},
};

export const Empty: Story = {
	render: () => renderTable([]),
	parameters: {
		docs: {
			description: {
				story: 'Empty customer table state with the create action still available.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.queryByText('Acme Corp')).toBeNull();
		await expect(canvas.queryByText('Nova Retail')).toBeNull();
	},
};
