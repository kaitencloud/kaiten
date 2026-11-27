import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The list of outbound webhooks (`/integrations/webhooks`): its rows, found by
 * the URL each webhook posts to, the link to the create page, and the actions
 * of a row (edit, show the signing secret, delete).
 */
export class WebhooksListDriver {
  constructor(private readonly page: Page) {}

  async gotoList() {
    await this.page.goto('/integrations/webhooks');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Webhooks' }),
    ).toBeVisible();
  }

  /** The rows of the table, header apart. */
  rows(): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  /** One row, found by the URL of its webhook. */
  row(url: string): Locator {
    return this.rows().filter({ hasText: url });
  }

  /** The call to create a webhook: a link, since the form is a page of its own. */
  newWebhook(): Locator {
    return this.page
      .getByRole('link', { name: /^(New Webhook|Nouveau webhook)$/ })
      .first();
  }

  /** The Edit action of a row, named by the webhook's host, in either language. */
  editRow(url: string): Locator {
    return this.row(url).getByRole('link', {
      name: /^(Edit webhook|Modifier le webhook) /,
    });
  }

  /** Shows a row's signing secret, read from the API on demand. */
  async revealSecret(url: string) {
    await this.row(url)
      .getByRole('button', { name: 'Show signing secret' })
      .click();
    await expect(
      this.row(url).getByRole('button', { name: 'Hide signing secret' }),
    ).toBeVisible();
  }
}
