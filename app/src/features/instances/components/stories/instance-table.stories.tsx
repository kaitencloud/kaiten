import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { toInstanceBillingSummary } from '@/domains/billing';
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

const pastDue = toInstanceBillingSummary({
	cancelAtPeriodEnd: false,
	currentPeriodEnd: '2027-04-01T00:00:00.000Z',
	pastDueSince: '2027-03-02T10:00:00.000Z',
	providerKind: 'NOOP',
	status: 'PAST_DUE',
	trialEndsAt: null,
});

export const WithBilling: Story = {
	render: () => (
		<StorybookRouter>
			<div className="min-h-screen p-6">
				<InstancesTable
					billing={{
						available: true,
						isPending: false,
						// The first instance is past due, the others were never subscribed.
						summaryOf: (slug) =>
							slug === storyInstanceRows[0]?.slug ? pastDue : null,
					}}
					instances={storyInstanceRows}
				/>
			</div>
		</StorybookRouter>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(
			await canvas.findByRole('columnheader', { name: 'Billing' }),
		).toBeVisible();
		await expect(await canvas.findByText('Past due')).toBeVisible();
	},
	parameters: {
		docs: {
			description: {
				story:
					"The Billing column, which the list has only where billing is on and the session may read it: the state of each instance's subscription, and a dash for one nobody subscribed.",
			},
		},
	},
};
