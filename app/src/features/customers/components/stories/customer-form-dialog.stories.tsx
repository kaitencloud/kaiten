import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { storyCustomers } from '@/test-fixtures/storybook-fixtures';
import { CustomerFormDialog } from '../customer-form-dialog';

const meta = {
	title: 'Features/Customers/CustomerFormDialog',
	component: CustomerFormDialog,
	parameters: {
		layout: 'fullscreen',
		docs: {
			story: { inline: false, iframeHeight: 720 },
		},
	},
	tags: ['autodocs'],
} satisfies Meta<typeof CustomerFormDialog>;

export default meta;
type Story = StoryObj<typeof CustomerFormDialog>;

function CustomerFormDialogStory({
	customer,
}: {
	customer?: (typeof storyCustomers)[number];
}) {
	const [open, setOpen] = useState(true);

	return (
		<StorybookRouter>
			<div className="flex min-h-screen items-center justify-center p-6">
				<CustomerFormDialog
					open={open}
					onOpenChange={setOpen}
					customer={customer}
					onSuccess={() => setOpen(false)}
				/>
			</div>
		</StorybookRouter>
	);
}

export const Create: Story = {
	render: () => <CustomerFormDialogStory />,
	parameters: {
		docs: {
			description: {
				story: 'Create customer dialog with an empty TanStack Form state.',
			},
		},
	},
};

export const Edit: Story = {
	render: () => <CustomerFormDialogStory customer={storyCustomers[0]} />,
	parameters: {
		docs: {
			description: {
				story: 'Edit customer dialog with persisted customer values prefilled.',
			},
		},
	},
};
