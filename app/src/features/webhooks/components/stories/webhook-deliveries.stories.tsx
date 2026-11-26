import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, http } from 'msw/http';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import type {
	Webhook,
	WebhookMessage,
	WebhookMessageSummary,
} from '../../types';
import {
	WebhookDeliveriesCell,
	WebhookDeliveriesDialog,
} from '../webhook-deliveries';
import {
	STORY_SLACK_URL,
	buildStoryMessageList,
	buildStoryMessages,
	storyApiWebhooks,
	storyWebhooks,
} from './webhooks.fixtures';

// The deliveries of one webhook: its row's cell in each state, and the dialog
// it opens, with the bodies and refusals the detail can meet. Every handler is
// declared per story, so each one reads the API it stands for.

const webhook: Webhook = storyWebhooks[0];

/** A mix: one being sent, one retrying, two failures, the rest delivered. */
const mixedMessages = buildStoryMessages(20, (index) => {
	if (index === 0) return 'sending';
	if (index === 1) return 'retrying';
	if (index === 3 || index === 9) return 'fail';
	return 'success';
});

/** The body of any message, unless a story says otherwise. */
function messageFor(
	messageId: string,
	overrides: Partial<WebhookMessage> = {},
): WebhookMessage {
	const summary = mixedMessages.find((message) => message.messageId === messageId);

	return {
		messageId,
		eventType: summary?.eventType,
		timestamp: summary?.timestamp,
		payloadAvailable: true,
		payload: {
			id: `evt_${messageId}`,
			type: summary?.eventType,
			data: { instance: { slug: 'acme-prod', region: 'eu-west-1' } },
		},
		attempts: summary?.lastAttempt
			? [{ ...summary.lastAttempt, response: 'ok' }]
			: [],
		...overrides,
	};
}

type ListAnswer = WebhookMessageSummary[] | 'error' | 'pending';
type MessageAnswer =
	| ((messageId: string) => WebhookMessage)
	| { status: number; code: string };

function deliveriesHandlers({
	list = mixedMessages,
	message = (messageId: string) => messageFor(messageId),
}: { list?: ListAnswer; message?: MessageAnswer } = {}) {
	return [
		http.get('*/api/webhooks/:webhookId/messages', ({ request }) => {
			if (list === 'pending') {
				return new Promise<never>(() => {});
			}
			if (list === 'error') {
				return HttpResponse.json(
					{
						code: 'GetWebhookMessages.LookupFailed',
						detail: 'The deliveries of this webhook could not be read.',
						status: 500,
					},
					{ status: 500 },
				);
			}
			const withAttempts =
				new URL(request.url).searchParams.get('withAttempts') !== 'false';

			return HttpResponse.json(
				buildStoryMessageList(storyApiWebhooks[0], list, { withAttempts }),
			);
		}),
		http.get('*/api/webhooks/:webhookId/messages/:messageId', ({ params }) =>
			typeof message === 'function'
				? HttpResponse.json(message(String(params.messageId)))
				: HttpResponse.json(
						{ code: message.code, detail: 'Refused.', status: message.status },
						{ status: message.status },
					),
		),
		http.post(
			'*/api/webhooks/:webhookId/messages/:messageId/resend',
			({ params }) =>
				HttpResponse.json(
					{ messageId: params.messageId, webhookId: params.webhookId },
					{ status: 202 },
				),
		),
	];
}

function Frame({ children }: { children: React.ReactNode }) {
	return (
		<StorybookRouter
			initialEntries={['/integrations/webhooks']}
			routePath="/integrations/webhooks"
		>
			<div className="min-h-screen p-6">{children}</div>
		</StorybookRouter>
	);
}

function DialogStory({ target = webhook }: { target?: Webhook }) {
	const [open, setOpen] = useState(true);

	return (
		<Frame>
			<WebhookDeliveriesDialog
				onOpenChange={setOpen}
				open={open}
				webhook={target}
			/>
		</Frame>
	);
}

function CellStory() {
	return (
		<Frame>
			<div className="w-56 rounded-md border p-3">
				<WebhookDeliveriesCell onOpen={() => {}} webhook={webhook} />
			</div>
		</Frame>
	);
}

const meta = {
	title: 'Features/Webhooks/P1WebhookDeliveries',
	component: WebhookDeliveriesDialog,
	parameters: {
		layout: 'fullscreen',
		msw: { handlers: deliveriesHandlers() },
	},
	tags: ['autodocs'],
} satisfies Meta<typeof WebhookDeliveriesDialog>;

export default meta;
type Story = StoryObj<typeof WebhookDeliveriesDialog>;

const findDialog = () =>
	findVisibleByRole(document.body, 'dialog', { name: 'Deliveries' });

export const Dialog: Story = {
	render: () => <DialogStory />,
	parameters: {
		docs: {
			description: {
				story:
					'The chronology of the 20 most recent deliveries beside the newest one: its body, its response, its attempts and Resend.',
			},
		},
	},
	play: async () => {
		const dialog = await findDialog();
		await expect(
			await within(dialog).findByText(/16 \/ 20 delivered/),
		).toBeVisible();
		await expect(
			within(dialog).getByRole('list', { name: 'Deliveries' }),
		).toBeVisible();
	},
};

export const DialogEmpty: Story = {
	render: () => <DialogStory />,
	parameters: { msw: { handlers: deliveriesHandlers({ list: [] }) } },
};

export const DialogLoadError: Story = {
	render: () => <DialogStory />,
	parameters: { msw: { handlers: deliveriesHandlers({ list: 'error' }) } },
};

export const ManyDeliveries: Story = {
	render: () => <DialogStory />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				list: buildStoryMessages(50, (index) =>
					index % 7 === 3 ? 'fail' : 'success',
				),
			}),
		},
	},
};

export const PayloadGone: Story = {
	render: () => <DialogStory />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				message: (messageId) =>
					messageFor(messageId, { payload: null, payloadAvailable: false }),
			}),
		},
	},
};

export const DeliveryNotFound: Story = {
	render: () => <DialogStory />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				message: { status: 404, code: 'GetWebhookMessage.MessageNotFound' },
			}),
		},
	},
};

export const MessageLoadError: Story = {
	render: () => <DialogStory />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				message: { status: 500, code: 'GetWebhookMessage.LookupFailed' },
			}),
		},
	},
};

export const ChatEndpoint: Story = {
	render: () => <DialogStory target={{ ...webhook, url: STORY_SLACK_URL }} />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				message: (messageId) => messageFor(messageId, { chatService: 'Slack' }),
			}),
		},
	},
};

export const UnknownEventAndStatus: Story = {
	render: () => <DialogStory />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				list: [
					{
						...mixedMessages[2],
						eventType: 'com.kaiten.gadget.v1.created',
					},
					{ ...mixedMessages[4], eventType: '' },
					{
						...mixedMessages[5],
						// A status newer than this build reads as pending.
						status: 'queued' as WebhookMessageSummary['status'],
					},
				],
			}),
		},
	},
};

export const ResendInFlight: Story = {
	render: () => <DialogStory />,
	parameters: {
		msw: {
			handlers: deliveriesHandlers({
				message: (messageId) =>
					messageFor(messageId, {
						attempts: [
							{
								id: 'atmpt_story_resend',
								timestamp: mixedMessages[0].timestamp,
								status: 'sending',
								triggerType: 'manual',
							},
						],
					}),
			}),
		},
	},
};

export const CellStrip: Story = {
	render: () => <CellStory />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByRole('button', { name: /^Deliveries of / }),
		).toBeVisible();
	},
};

export const CellLoading: Story = {
	render: () => <CellStory />,
	parameters: { msw: { handlers: deliveriesHandlers({ list: 'pending' }) } },
};

export const CellError: Story = {
	render: () => <CellStory />,
	parameters: { msw: { handlers: deliveriesHandlers({ list: 'error' }) } },
};

export const CellNone: Story = {
	render: () => <CellStory />,
	parameters: { msw: { handlers: deliveriesHandlers({ list: [] }) } },
};
