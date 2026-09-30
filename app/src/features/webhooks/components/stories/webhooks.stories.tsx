import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
	webhookHistoryQueryOptions,
	webhooksQueryOptions,
} from '../../queries';
import {
	storyApiWebhooks,
	storyWebhookHistory,
	storyWebhooks,
} from './webhooks.fixtures';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import type { WebhookHistoryEntry } from '../../types';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { WebhookHistoryFailureDialog } from '../webhook-history/webhook-history-failure-dialog';
import { WebhookHistorySection } from '../webhook-history/webhook-history-section';
import { CreateWebhookDialog } from '../webhook-list/create-webhook-dialog';
import { WebhookList } from '../webhook-list/webhook-list';
import { WebhookListContent } from '../webhook-list/webhook-list-content';
import { WebhookTable } from '../webhook-list/webhook-table';
import { WebhooksPageContent } from '../webhooks-page-content';

const seedWebhookQueries = (queryClient: QueryClient) => {
	queryClient.setQueryData(webhooksQueryOptions.queryKey, storyApiWebhooks);
	queryClient.setQueryData(webhookHistoryQueryOptions.queryKey, {
		history: storyWebhookHistory,
	});
};

const meta = {
	title: 'Features/Webhooks/P0WebhooksStories',
	component: WebhookList,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof WebhookList>;

export default meta;
type Story = StoryObj<typeof WebhookList>;

function WebhookFrame({
	children,
	initialEntry = '/integrations/webhooks',
}: {
	children: React.ReactNode;
	initialEntry?: string;
}) {
	return (
		<StorybookRouter
			initialEntries={[initialEntry]}
			routePath="/integrations/webhooks"
			seed={seedWebhookQueries}
		>
			<div className="min-h-screen p-6">{children}</div>
		</StorybookRouter>
	);
}

export const PageWithList: Story = {
	render: () => (
		<WebhookFrame>
			<WebhooksPageContent>
				<WebhookList />
			</WebhooksPageContent>
		</WebhookFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Webhook page content with tabs, filters, create action and table data backed by query fixtures.',
			},
		},
	},
};

export const Table: Story = {
	render: () => (
		<WebhookFrame>
			<div className="h-[520px]">
				<WebhookTable webhooks={storyWebhooks} onDelete={() => {}} />
			</div>
		</WebhookFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Webhook table with grouped events, URL, signing secret disclosure and delete action.',
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(
			await canvas.findByText('https://hooks.example.com/customers'),
		).toBeVisible();
		await expect(
			canvas.getByText('https://ops.example.com/kaiten'),
		).toBeVisible();
	},
};

export const EmptyList: Story = {
	render: () => (
		<WebhookFrame>
			<WebhookListContent
				filteredWebhooks={[]}
				onDelete={() => {}}
				webhooks={[]}
			/>
		</WebhookFrame>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(
			canvas.queryByText('https://hooks.example.com/customers'),
		).toBeNull();
	},
};

export const NoSearchResults: Story = {
	render: () => (
		<WebhookFrame>
			<WebhookListContent
				filteredWebhooks={[]}
				onDelete={() => {}}
				webhooks={storyWebhooks}
			/>
		</WebhookFrame>
	),
};

function CreateWebhookDialogStory() {
	const [open, setOpen] = useState(true);

	return (
		<WebhookFrame>
			<div className="flex min-h-[680px] items-center justify-center">
				<CreateWebhookDialog
					open={open}
					onOpenChange={setOpen}
					onSubmit={() => undefined}
				/>
			</div>
		</WebhookFrame>
	);
}

export const CreateDialog: Story = {
	render: () => <CreateWebhookDialogStory />,
	parameters: {
		docs: {
			description: {
				story:
					'Create webhook dialog with event category selection, selected-events summary and URL validation.',
			},
		},
	},
	play: async () => {
		// The dialog renders in a portal under document.body, not inside
		// canvasElement. Scope to body to find it.
		await expect(await findVisibleByRole(document.body, 'dialog')).toBeVisible();
	},
};

export const History: Story = {
	render: () => (
		<WebhookFrame initialEntry="/integrations/webhooks/history">
			<WebhooksPageContent>
				<WebhookHistorySection />
			</WebhooksPageContent>
		</WebhookFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Webhook history table with status filters and failure details available from failed deliveries.',
			},
		},
	},
};

function FailureDialogStory() {
	const [entry, setEntry] = useState<WebhookHistoryEntry | null>(
		storyWebhookHistory[1],
	);

	return (
		<WebhookFrame>
			<div className="flex min-h-[320px] items-center justify-center" />
			<WebhookHistoryFailureDialog
				entry={entry}
				onOpenChange={(open) => {
					if (!open) {
						setEntry(null);
					}
				}}
			/>
		</WebhookFrame>
	);
}

export const FailureDialog: Story = {
	render: () => <FailureDialogStory />,
	parameters: {
		docs: {
			description: {
				story:
					'Failure dialog for a webhook delivery with status code and response body.',
			},
		},
	},
	play: async () => {
		const dialog = await findVisibleByRole(document.body, 'dialog', {
			name: 'Failed delivery details',
		});
		await expect(dialog).toBeVisible();
		await expect(within(dialog).getByText(/release\.created/)).toBeVisible();
	},
};
