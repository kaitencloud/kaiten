import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { http, HttpResponse } from "msw/http";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { server } from "@/__tests__/msw-server";
import { webhooksQueryOptions } from "../../../queries";
import { WebhookList } from "../webhook-list";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useSuspenseQuery: vi.fn(),
  };
});

const deleteWebhookMutate = vi.fn();

vi.mock("@/hooks/use-granted-scopes", () => ({
  useGrantedScopes: () => ({ isPending: false, scopes: null }),
}));

vi.mock("../../../hooks/use-webhook-mutations", () => ({
  useWebhookMutations: () => ({
    deleteWebhook: {
      mutate: deleteWebhookMutate,
    },
  }),
}));

// "New Webhook" is a link to the create page: rendered as a plain anchor, so
// the test needs no router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
  }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    init: () => undefined,
    type: "3rdParty",
  },
  useTranslation: () => ({
    t: (key: string, options?: { host?: string }) => {
      const translations: Record<string, string> = {
        "Common.actions": "Actions",
        "Common.confirm": "Confirm",
        "Common.confirmDeleteDescription": "Delete {{name}}?",
        "Common.confirmDeleteTitle": "Delete",
        "Common.delete": "Delete",
        "Features.AuditTrail.events.CUSTOMER_CREATED": "Customer created",
        "Features.AuditTrail.events.INSTANCE_UPDATED": "Instance updated",
        "Common.filterBy": "Filter by",
        "Common.filterFieldPlaceholder": "Filter {{field}}",
        "Common.noResults": "No results",
        "Pages.Integrations.Webhooks.Deliveries.cell.ariaLabel":
          "Deliveries of {{host}}",
        "Pages.Integrations.Webhooks.Filters.queryPlaceholder": "Search webhooks",
        "Pages.Integrations.Webhooks.Table.created": "Created",
        "Pages.Integrations.Webhooks.Table.events": "Events",
        "Pages.Integrations.Webhooks.Table.url": "Webhook URL",
        "Pages.Integrations.Webhooks.emptyState": "No webhooks configured yet.",
        "Pages.Integrations.Webhooks.emptyStateHint":
          "Create a webhook to receive notifications when events occur.",
        "Pages.Integrations.Webhooks.newButton": "New Hook",
      };

      return (translations[key] ?? key).replace(
        "{{host}}",
        options?.host ?? "",
      );
    },
  }),
}));

const useSuspenseQueryMock = vi.mocked(useSuspenseQuery);

const webhookApiData = [
  {
    createdAt: "2026-03-01T12:00:00Z",
    eventTypes: ["com.kaiten.customer.v1.created"],
    id: "webhook-1",
    url: "https://example.com/customer-hook",
  },
  {
    createdAt: "2026-03-02T12:00:00Z",
    eventTypes: ["com.kaiten.instance.v1.updated"],
    id: "webhook-2",
    url: "https://example.com/instance-hook",
  },
];

/** Serves each webhook one delivered message, and the message itself. */
function serveDeliveries() {
  server.use(
    http.get("*/webhooks/:webhookId/messages", ({ params }) =>
      HttpResponse.json({
        webhook: {
          id: params.webhookId,
          url: "https://example.com/customer-hook",
          createdAt: "2026-03-01T12:00:00Z",
          updatedAt: "2026-03-01T12:00:00Z",
        },
        messages: [
          {
            messageId: "msg_1",
            eventType: "com.kaiten.customer.v1.created",
            timestamp: "2026-03-03T12:00:00Z",
            status: "success",
          },
        ],
        summary: { total: 1, delivered: 1, failed: 0, pending: 0 },
        hasMore: false,
      }),
    ),
    http.get("*/webhooks/:webhookId/messages/:messageId", ({ params }) =>
      HttpResponse.json({
        messageId: params.messageId,
        payload: { name: "CUSTOMER_CREATED" },
        attempts: [],
      }),
    ),
  );
}

function renderWebhookList() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WebhookList />
    </QueryClientProvider>,
  );
}

describe("WebhookList", () => {
  beforeEach(() => {
    serveDeliveries();
    deleteWebhookMutate.mockReset();
    useSuspenseQueryMock.mockReset();
    useSuspenseQueryMock.mockImplementation((query) => {
      if (query === webhooksQueryOptions) {
        return { data: webhookApiData } as never;
      }

      return { data: [] } as never;
    });
  });

  it("links New Webhook to the create page", () => {
    renderWebhookList();

    expect(screen.getByRole("link", { name: "New Hook" })).toHaveAttribute(
      "href",
      "/integrations/webhooks/new",
    );
  });

  it("filters webhooks by event label", async () => {
    renderWebhookList();

    fireEvent.change(screen.getByPlaceholderText("Search webhooks"), {
      target: { value: "Customer created" },
    });

    await waitFor(() => {
      expect(
        screen.queryByText("https://example.com/instance-hook"),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("https://example.com/customer-hook"),
    ).toBeInTheDocument();
  });

  it("distinguishes empty state from no-results state", async () => {
    const { rerender } = renderWebhookList();

    fireEvent.change(screen.getByPlaceholderText("Search webhooks"), {
      target: { value: "no-match" },
    });

    await waitFor(() => {
      expect(screen.getByText("No results")).toBeInTheDocument();
    });

    useSuspenseQueryMock.mockImplementation((query) => {
      if (query === webhooksQueryOptions) {
        return { data: [] } as never;
      }

      return { data: [] } as never;
    });

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: {
                retry: false,
              },
            },
          })
        }
      >
        <WebhookList />
      </QueryClientProvider>,
    );

    expect(screen.getByText("No webhooks configured yet.")).toBeInTheDocument();
  });
  it("opens the deliveries of a webhook, and closes them once it is deleted", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <WebhookList />
      </QueryClientProvider>,
    );

    // Both webhooks share a host: open the first row's.
    const [open] = await screen.findAllByRole("button", {
      name: "Deliveries of example.com",
    });
    fireEvent.click(open);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    useSuspenseQueryMock.mockImplementation(() => ({ data: [] }) as never);
    rerender(
      <QueryClientProvider client={queryClient}>
        <WebhookList />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
