import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { WebhooksTabs } from "../webhooks-tabs";

let currentPath = "/integrations/webhooks";

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
    <a className={className} data-to={to} href={to}>
      {children}
    </a>
  ),
  useLocation: ({
    select,
  }: {
    select?: (location: { pathname: string }) => unknown;
  } = {}) => {
    const location = {
      pathname: currentPath,
    };

    return select ? select(location) : location;
  },
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    init: () => undefined,
    type: "3rdParty",
  },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "Pages.Integrations.Webhooks.Tabs.event": "Events",
        "Pages.Integrations.Webhooks.Tabs.history": "History",
      };

      return translations[key] ?? key;
    },
  }),
}));

describe("WebhooksTabs", () => {
  it("activates the event tab on the base route", () => {
    currentPath = "/integrations/webhooks";

    render(<WebhooksTabs />);

    expect(screen.getByText("Events")).toHaveClass("bg-background");
    expect(screen.getByText("History")).toHaveAttribute(
      "data-to",
      "/integrations/webhooks/history",
    );
  });

  it("activates the history tab on the history route", () => {
    currentPath = "/integrations/webhooks/history";

    render(<WebhooksTabs />);

    expect(screen.getByText("History")).toHaveClass("bg-background");
    expect(screen.getByText("Events")).toHaveAttribute(
      "data-to",
      "/integrations/webhooks",
    );
  });
});
