import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { webhooksQueryOptions } from "../../../queries";
import { WebhookList } from "../webhook-list";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useSuspenseQuery: vi.fn(),
  };
});

const createWebhookMutate = vi.fn();
const createWebhookMutateAsync = vi.fn();
const deleteWebhookMutate = vi.fn();

vi.mock("../../../hooks/use-webhook-mutations", () => ({
  useWebhookMutations: () => ({
    createWebhook: {
      isPending: false,
      mutate: createWebhookMutate,
      mutateAsync: createWebhookMutateAsync,
    },
    deleteWebhook: {
      mutate: deleteWebhookMutate,
    },
  }),
}));

vi.mock("../create-webhook-dialog", () => ({
  CreateWebhookDialog: ({ open }: { open: boolean }) => (
    <div>{open ? "Create dialog open" : "Create dialog closed"}</div>
  ),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    init: () => undefined,
    type: "3rdParty",
  },
  useTranslation: () => ({
    t: (key: string) => {
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
        "Pages.Integrations.Webhooks.Dialog.title": "New Webhook",
        "Pages.Integrations.Webhooks.Filters.queryPlaceholder": "Search webhooks",
        "Pages.Integrations.Webhooks.Table.created": "Created",
        "Pages.Integrations.Webhooks.Table.events": "Events",
        "Pages.Integrations.Webhooks.Table.url": "Webhook URL",
        "Pages.Integrations.Webhooks.emptyState": "No webhooks configured yet.",
        "Pages.Integrations.Webhooks.emptyStateHint":
          "Create a webhook to receive notifications when events occur.",
        "Pages.Integrations.Webhooks.newButton": "New Hook",
      };

      return translations[key] ?? key;
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
    createWebhookMutate.mockReset();
    createWebhookMutateAsync.mockReset();
    deleteWebhookMutate.mockReset();
    useSuspenseQueryMock.mockReset();
    useSuspenseQueryMock.mockImplementation((query) => {
      if (query === webhooksQueryOptions) {
        return { data: webhookApiData } as never;
      }

      return { data: [] } as never;
    });
  });

  it("opens the create dialog from the gradient button", async () => {
    const user = userEvent.setup();

    renderWebhookList();

    expect(screen.getByText("Create dialog closed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Hook" }));

    expect(screen.getByText("Create dialog open")).toBeInTheDocument();
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
});
