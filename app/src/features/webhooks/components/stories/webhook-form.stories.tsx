import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse, http } from 'msw/http';
import { userEvent, within } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import type { ApiWebhook } from '../../types';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from '../../utils/webhook-events';
import { WebhookFormPage } from '../webhook-form';
import {
  STORY_GOOGLE_CHAT_URL,
  STORY_SLACK_URL,
  storyApiWebhooks,
  storyWebhookManyEvents,
  storyWebhookOtherEvents,
} from './webhooks.fixtures';

// The page needs the router (it navigates), a QueryClient and the API: it is
// excluded from the Storybook test runner (vite.config.ts), and its behaviour
// is covered by the page's unit test and the e2e specs. These stories are for
// looking at it: the sticky column, the chat notice, a long selection, and a
// webhook without a filter, kept that way or about to be narrowed.
function FormFrame({ webhook }: { webhook?: ApiWebhook }) {
  return (
    <StorybookRouter
      initialEntries={['/integrations/webhooks/new']}
      routePath="/integrations/webhooks/new"
    >
      <div className="h-screen">
        <WebhookFormPage webhook={webhook} />
      </div>
    </StorybookRouter>
  );
}

const meta = {
  title: 'Features/Webhooks/WebhookForm',
  component: FormFrame,
  parameters: {
    layout: 'fullscreen',
    msw: {
      // The webhooks API is outside the OpenAPI contract (webhooks.api.ts).
      handlers: [
        http.get('*/api/webhooks', () => HttpResponse.json(storyApiWebhooks)),
        http.post('*/api/webhooks', async ({ request }) =>
          HttpResponse.json(
            { ...((await request.json()) as object), id: 'ep_story' },
            { status: 201 },
          ),
        ),
        http.get('*/api/webhooks/:webhookId', () =>
          HttpResponse.json(storyApiWebhooks[0]),
        ),
        http.put('*/api/webhooks/:webhookId', async ({ params, request }) =>
          HttpResponse.json({
            ...((await request.json()) as object),
            id: params.webhookId,
          }),
        ),
      ],
    },
  },
} satisfies Meta<typeof FormFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

const SIXTY_EVENTS = SUBSCRIBABLE_WEBHOOK_EVENTS.flatMap((entry) =>
  entry.events.map((event) => event.type as string),
).filter((_, index) => index % 2 === 0).slice(0, 60);

export const Create: Story = {};

export const Edit: Story = {
  args: { webhook: storyApiWebhooks[0] },
};

export const EditWithManyEvents: Story = {
  args: { webhook: storyWebhookManyEvents },
};

export const EditWithOtherEvents: Story = {
  args: { webhook: storyWebhookOtherEvents },
};

/** "Keep receiving every event" ticked, as the page opens: no picker. */
export const EditWithoutFilter: Story = {
  args: {
    webhook: { ...storyApiWebhooks[0], eventTypes: null },
  },
};

/** The box unticked: the picker, and the warning that saving is for good. */
export const EditWithoutFilterNarrowing: Story = {
  args: EditWithoutFilter.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('checkbox', {
        name: 'Keep receiving every event',
      }),
    );
  },
};

export const SlackNotice: Story = {
  args: { webhook: { ...storyApiWebhooks[0], url: STORY_SLACK_URL } },
};

export const GoogleChatNotice: Story = {
  args: { webhook: { ...storyApiWebhooks[0], url: STORY_GOOGLE_CHAT_URL } },
};

/** Sixty events and the Slack notice: the tallest the column gets. */
export const LongSelection: Story = {
  args: {
    webhook: {
      ...storyApiWebhooks[0],
      eventTypes: SIXTY_EVENTS,
      url: STORY_SLACK_URL,
    },
  },
};
