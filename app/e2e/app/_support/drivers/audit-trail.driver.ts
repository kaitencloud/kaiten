import { expect, type Locator, type Page } from '@playwright/test';

export class AuditTrailDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/audit-trail');
    await expect(
      this.page.getByRole('heading', { name: 'Audit trail', level: 1 }),
    ).toBeVisible();
  }

  /**
   * The figure of a card above the feed ("Warnings"), read with its label. A
   * card has no role, and its label is also a filter and a badge, so the
   * driver finds the paragraph that holds it.
   */
  async expectStatCount(label: string, count: number) {
    await expect(
      this.page
        .locator('p')
        .filter({ hasText: new RegExp(`^${label}$`) })
        .locator('..'),
    ).toHaveText(new RegExp(`^${count}\\s*${label}$`));
  }

  /** The quick status filter: All, Accepted, Rejected, Warning or Read. */
  async filterByStatus(status: string) {
    await this.page
      .getByRole('group', { name: 'Filter by status' })
      .getByRole('button', { name: status, exact: true })
      .click();
  }

  /** A row of the feed, found by the label of its event. */
  eventRow(eventLabel: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(eventLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
  }

  async expectEventStatus(eventLabel: string, status: string) {
    await expect(this.eventRow(eventLabel)).toContainText(status);
  }
}
