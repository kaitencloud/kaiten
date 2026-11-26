import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { http, HttpResponse } from 'msw/http';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import en from '@/lib/i18n/locales/en';
import type { ApiWebhook } from '../../../types';
import { WEBHOOK_EVENTS } from '../../../utils/webhook-event-catalogue';
import { WebhookFormPage } from '../webhook-form-page';

const { navigateMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;
const CUSTOMER_UPDATED = WEBHOOK_EVENTS.CUSTOMER_UPDATED.type;
const MODEL_CREATED = WEBHOOK_EVENTS.MODEL_CREATED.type;
const FEATURE_FLAG_EVALUATED = WEBHOOK_EVENTS.FEATURE_FLAG_EVALUATED.type;
const UNKNOWN = 'com.kaiten.future.v1.created';

// Every change of the form draws the picker again: a test that fills and sends
// the form can take several seconds on a loaded runner.
const FORM_TEST_TIMEOUT_MS = 30_000;

const stored: ApiWebhook = {
  id: 'ep_customers',
  url: 'https://api.example.com/hooks/customers',
  eventTypes: [CUSTOMER_UPDATED, CUSTOMER_CREATED],
  signingSecret: 'whsec_test',
};

type Recorded = { method: string; body?: unknown };

/** Serves the webhooks API and records each write, in order. */
function serveWebhooks({
  webhook = stored,
  refuseCreate = false,
}: { webhook?: ApiWebhook; refuseCreate?: boolean } = {}) {
  const writes: Recorded[] = [];

  server.use(
    http.post('*/webhooks', async ({ request }) => {
      const body = (await request.json()) as ApiWebhook;
      writes.push({ method: 'POST', body });
      return refuseCreate
        ? HttpResponse.json(
            {
              status: 422,
              title: 'Unprocessable Entity',
              code: 'Svix.ValidationError',
              detail: 'The URL cannot receive events.',
            },
            { status: 422 },
          )
        : HttpResponse.json({ ...body, id: 'ep_new' }, { status: 201 });
    }),
    http.get('*/webhooks/:webhookId', () => HttpResponse.json(webhook)),
    http.put('*/webhooks/:webhookId', async ({ params, request }) => {
      const body = (await request.json()) as ApiWebhook;
      writes.push({ method: 'PUT', body });
      return HttpResponse.json({ ...body, id: params.webhookId });
    }),
  );

  return writes;
}

beforeAll(() => {
  configureApiClient();
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

beforeEach(() => {
  navigateMock.mockReset();
  navigateMock.mockResolvedValue(undefined);
});

afterEach(() => {
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

function renderPage(webhook?: ApiWebhook) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WebhookFormPage webhook={webhook} />
    </QueryClientProvider>,
  );
}

const urlInput = () => screen.getByRole('textbox', { name: 'Webhook URL' });
const createButton = () => screen.getByRole('button', { name: 'Create Webhook' });
const saveButton = () => screen.getByRole('button', { name: 'Save' });

async function tickCustomerCreated(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Customers\b/ }));
  await user.click(screen.getByRole('checkbox', { name: 'Customer created' }));
}

describe('WebhookFormPage, create', () => {
  it(
    'sends the URL trimmed and the events in catalogue order, then goes back to the list',
    async () => {
      const user = userEvent.setup();
      const writes = serveWebhooks();
      renderPage();

      expect(screen.getByRole('heading', { name: 'New Webhook' })).toBeVisible();
      expect(createButton()).toBeDisabled();

      await user.type(urlInput(), '  https://hooks.example.com/kaiten  ');
      expect(createButton()).toBeDisabled();
      await user.click(screen.getByRole('button', { name: /^Models\b/ }));
      await user.click(screen.getByRole('checkbox', { name: 'Model created' }));
      await tickCustomerCreated(user);
      await user.click(createButton());

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith({ to: '/integrations/webhooks' });
      });
      expect(writes).toEqual([
        {
          method: 'POST',
          body: {
            eventTypes: [MODEL_CREATED, CUSTOMER_CREATED],
            url: 'https://hooks.example.com/kaiten',
          },
        },
      ]);
      expect(toastSuccessMock).toHaveBeenCalledWith('Webhook created');
    },
    FORM_TEST_TIMEOUT_MS,
  );

  it('keeps the browser from sending the form itself', () => {
    serveWebhooks();
    const { container } = renderPage();
    const form = container.querySelector('form')!;
    const submit = createEvent.submit(form);

    fireEvent(form, submit);

    expect(submit.defaultPrevented).toBe(true);
  });

  it(
    "keeps what was typed when the API refuses, and shows the API's words",
    async () => {
      const user = userEvent.setup();
      serveWebhooks({ refuseCreate: true });
      renderPage();

      await user.type(urlInput(), 'https://hooks.example.com/kaiten');
      await tickCustomerCreated(user);
      await user.click(createButton());

      await waitFor(() => {
        expect(toastErrorMock).toHaveBeenCalledWith(
          expect.stringContaining('The URL cannot receive events.'),
        );
      });
      expect(navigateMock).not.toHaveBeenCalled();
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(urlInput()).toHaveValue('https://hooks.example.com/kaiten');
      expect(screen.getByText('1 event selected')).toBeVisible();
    },
    FORM_TEST_TIMEOUT_MS,
  );

  it('refuses a URL that is not http or https', async () => {
    const user = userEvent.setup();
    serveWebhooks();
    renderPage();

    await user.type(urlInput(), 'ftp://files.example.com');
    await user.tab();

    expect(await screen.findByText('Enter a valid http or https URL.')).toBeVisible();
  });

  it.each([
    ['https://hooks.slack.com/services/T000/B000/XXXX', 'Slack'],
    ['https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k', 'Google Chat'],
  ])('says that %s receives chat messages', async (url, service) => {
    const user = userEvent.setup();
    serveWebhooks();
    renderPage();

    await user.type(urlInput(), url);

    expect(await screen.findByText('Sent as chat messages')).toBeVisible();
    expect(
      screen.getByText(new RegExp(`This is a ${service} incoming webhook`)),
    ).toBeVisible();

    await user.clear(urlInput());
    await waitFor(() => {
      expect(screen.queryByText('Sent as chat messages')).toBeNull();
    });
  });

  it('says nothing for a Slack workflow URL', async () => {
    const user = userEvent.setup();
    serveWebhooks();
    renderPage();

    await user.type(urlInput(), 'https://hooks.slack.com/workflows/T000/A000/1/XXXX');

    expect(screen.queryByText('Sent as chat messages')).toBeNull();
  });
});

describe('WebhookFormPage, edit', () => {
  it(
    'opens with the webhook, keeps Save off until something really changed, and saves on a fresh read',
    async () => {
      const user = userEvent.setup();
      const writes = serveWebhooks({
        webhook: { ...stored, url: 'https://api.example.com/hooks/moved' },
      });
      renderPage(stored);

      expect(screen.getByRole('heading', { name: 'Edit Webhook' })).toBeVisible();
      expect(urlInput()).toHaveValue(stored.url);
      expect(screen.getByText('2 events selected')).toBeVisible();
      expect(saveButton()).toBeDisabled();

      // Unticked then ticked again: the stock dirty flag would stay on.
      await tickCustomerCreated(user);
      expect(saveButton()).toBeEnabled();
      await user.click(screen.getByRole('checkbox', { name: 'Customer created' }));
      expect(saveButton()).toBeDisabled();

      await user.click(screen.getByRole('button', { name: /^Models\b/ }));
      await user.click(screen.getByRole('checkbox', { name: 'Model created' }));
      await user.click(saveButton());

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith({ to: '/integrations/webhooks' });
      });
      // The URL moved elsewhere meanwhile: the save keeps it, and adds the event.
      expect(writes).toEqual([
        {
          method: 'PUT',
          body: {
            eventTypes: [MODEL_CREATED, CUSTOMER_CREATED, CUSTOMER_UPDATED],
            url: 'https://api.example.com/hooks/moved',
          },
        },
      ]);
      expect(toastSuccessMock).toHaveBeenCalledWith('Webhook updated');
    },
    FORM_TEST_TIMEOUT_MS,
  );

  it(
    'keeps the events this console does not offer',
    async () => {
      const user = userEvent.setup();
      const webhook = {
        ...stored,
        eventTypes: [UNKNOWN, CUSTOMER_CREATED, FEATURE_FLAG_EVALUATED],
      };
      const writes = serveWebhooks({ webhook });
      renderPage(webhook);

      expect(screen.getByRole('button', { name: /^Other events\b/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await user.clear(urlInput());
      await user.type(urlInput(), 'https://api.example.com/hooks/new');
      await user.click(saveButton());

      await waitFor(() => {
        expect(writes).toHaveLength(1);
      });
      expect(writes[0]?.body).toEqual({
        eventTypes: [CUSTOMER_CREATED, FEATURE_FLAG_EVALUATED, UNKNOWN],
        url: 'https://api.example.com/hooks/new',
      });
    },
    FORM_TEST_TIMEOUT_MS,
  );

  it('says a webhook without a filter receives every event, and needs events to be saved', async () => {
    const user = userEvent.setup();
    const webhook = { ...stored, eventTypes: null as unknown as string[] };
    serveWebhooks({ webhook });
    renderPage(webhook);

    expect(
      screen.getByText(
        'This webhook has no event filter, so it receives every event. Choose the events it should receive.',
      ),
    ).toBeVisible();
    expect(screen.getByText('0 events selected')).toBeVisible();

    await user.type(urlInput(), '/v2');

    expect(saveButton()).toBeDisabled();
  });
});
