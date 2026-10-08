import { expect, type Locator, type Page } from '@playwright/test';
import { BILLED_NOW } from '../../billing/billed-instances';

/**
 * The usage history of an entitlement of an instance: the link on its row, the
 * drawer, its period and its export, and the states of its reports. The drawer
 * is opened by the URL (`?history=`) as much as by the link.
 */
export class UsageHistoryDriver {
  constructor(private readonly page: Page) {}

  /** Freezes the clock of the page, so that the last 30 days are the same days whatever day it runs. Call before `gotoEntitlements`. */
  async freezeTime() {
    await this.page.clock.setFixedTime(new Date(BILLED_NOW));
  }

  /** Opens the Entitlements tab of an instance. */
  async gotoEntitlements(instanceSlug: string, search = '') {
    await this.page.goto(
      `/customers/instances/${instanceSlug}/entitlements${search}`,
    );
  }

  /** The link on the row of an entitlement. */
  link(entitlementName: string): Locator {
    return this.page.getByRole('link', {
      name: `Usage history of ${entitlementName}`,
    });
  }

  drawer(): Locator {
    return this.page.getByTestId('usage-history');
  }

  async open(entitlementName: string) {
    await this.link(entitlementName).click();
    await expect(this.drawer()).toBeVisible();
  }

  rows(): Locator {
    return this.drawer()
      .getByRole('row')
      .filter({
        hasNot: this.page.getByRole('columnheader'),
      });
  }

  headers(): Locator {
    return this.drawer().getByRole('columnheader');
  }

  loadMore(): Locator {
    return this.drawer().getByRole('button', { name: 'Load more reports' });
  }

  fromField(): Locator {
    return this.drawer().getByLabel('From');
  }

  beforeField(): Locator {
    return this.drawer().getByLabel('Before');
  }

  async setPeriod(from: string, before: string) {
    await this.fromField().fill(from);
    await this.beforeField().fill(before);
  }

  exportButton(): Locator {
    return this.drawer().getByRole('button', { name: 'Export CSV' });
  }

  empty(): Locator {
    return this.drawer().getByTestId('usage-history-empty');
  }

  outsideRetention(): Locator {
    return this.drawer().getByTestId('usage-history-outside-retention');
  }

  error(): Locator {
    return this.drawer().getByTestId('usage-history-error');
  }

  /** The button of a report that opens what the instance sent with it. */
  propertiesButton(seq: number): Locator {
    return this.drawer().getByRole('button', {
      name: `Show the properties of report ${seq}`,
    });
  }

  async close() {
    await this.drawer().getByRole('button', { name: 'Close' }).first().click();
    await expect(this.drawer()).toHaveCount(0);
  }
}
