import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { HttpResponse, http } from 'msw/http';
import { useState } from 'react';
import {
	buildStoryMessageList,
	storyApiWebhooks,
	storyWebhookHistory,
	storyWebhookMessages,
	storyWebhookReleaseMessage,
	storyWebhooks,
} from './webhooks.fixtures';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { deliveryFromHistoryEntry } from '../../utils/webhook-deliveries';
import { WebhookDeliveryDetailDialog } from '../webhook-deliveries';
import { WebhookHistorySection } from '../webhook-history/webhook-history-section';
import { WebhookList } from '../webhook-list/webhook-list';
import { WebhookListContent } from '../webhook-list/webhook-list-content';
import { WebhookTable } from '../webhook-list/webhook-table';
import { WebhooksPageContent } from '../webhooks-page-content';

const meta = {
	title: 'Features/Webhooks/P0WebhooksStories',
	component: WebhookList,
	parameters: {
		layout: 'fullscreen',
		msw: {
			// The webhooks API is outside the OpenAPI contract
			// (webhooks.api.ts), so it has no generated handlers.
			handlers: [
				http.get('*/api/webhooks', () => HttpResponse.json(storyApiWebhooks)),
				http.get('*/api/webhooks/history', () =>
					HttpResponse.json({ history: storyWebhookHistory }),
				),
				http.get('*/api/webhooks/:webhookId/messages', ({ params, request }) => {
					const webhook = storyApiWebhooks.find(
						(item) => item.id === params.webhookId,
					);
					return webhook
						? HttpResponse.json(
								buildStoryMessageList(
									webhook,
									storyWebhookMessages[webhook.id] ?? [],
									{
										withAttempts:
											new URL(request.url).searchParams.get(
												'withAttempts',
											) !== 'false',
									},
								),
							)
						: HttpResponse.json(
								{ code: 'GetWebhookMessages.WebhookNotFound', status: 404 },
								{ status: 404 },
							);
				}),
				http.get('*/api/webhooks/:webhookId/messages/:messageId', () =>
					HttpResponse.json(storyWebhookReleaseMessage),
				),
				http.post(
					'*/api/webhooks/:webhookId/messages/:messageId/resend',
					({ params }) =>
						HttpResponse.json(
							{ messageId: params.messageId, webhookId: params.webhookId },
							{ status: 202 },
						),
				),
			],
		},
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
				<WebhookTable
					webhooks={storyWebhooks}
					onDelete={() => {}}
					onOpenDeliveries={() => {}}
				/>
			</div>
		</WebhookFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Webhook table with grouped events, URL, recent deliveries, signing secret disclosure and the edit and delete actions.',
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
				onOpenDeliveries={() => {}}
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
				onOpenDeliveries={() => {}}
				webhooks={storyWebhooks}
			/>
		</WebhookFrame>
	),
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
					'Webhook history table with status filters; every attempt opens the detail of its delivery.',
			},
		},
	},
};

function DeliveryDetailDialogStory() {
	const [open, setOpen] = useState(true);

	return (
		<WebhookFrame>
			<div className="flex min-h-[320px] items-center justify-center" />
			<WebhookDeliveryDetailDialog
				delivery={deliveryFromHistoryEntry(storyWebhookHistory[1])}
				initialAttemptId={storyWebhookHistory[1].attemptId}
				onOpenChange={setOpen}
				open={open}
			/>
		</WebhookFrame>
	);
}

export const DeliveryDetailDialog: Story = {
	render: () => <DeliveryDetailDialogStory />,
	parameters: {
		docs: {
			description: {
				story:
					'The History tab detail of one delivery: the body sent, the response to the clicked attempt, every attempt and Resend.',
			},
		},
	},
	play: async () => {
		const dialog = await findVisibleByRole(document.body, 'dialog', {
			name: 'Delivery details',
		});
		await expect(dialog).toBeVisible();
		// The dialog names the event by its audit trail label, not by its type:
		// com.kaiten.release.v1.created reads "Release published".
		await expect(within(dialog).getAllByText(/Release published/)[0]).toBeVisible();
	},
};
