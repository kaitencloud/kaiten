import type { Locator, Page } from '@playwright/test';

/**
 * The Entitlements tab of an instance, read for the limit of each entitlement: the
 * figure that opens a popover saying how it is composed, the line that says an
 * add-on grants it, and the usage card that draws the same limit. The history of an
 * entitlement is `UsageHistoryDriver`'s.
 */
export class InstanceEntitlementsDriver {
  constructor(private readonly page: Page) {}

  async goto(instanceSlug: string) {
    await this.page.goto(`/customers/instances/${instanceSlug}/entitlements`);
  }

  /** The row of an entitlement in the table, found by what it is called. */
  row(entitlement: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ hasText: entitlement })
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  /** The limit of an entitlement in the table: the figure, a button where it has a popover. */
  limit(entitlement: string): Locator {
    return this.row(entitlement).getByTestId('limit-provenance-trigger');
  }

  /** What the table says of where the entitlement comes from, when add-ons grant it. */
  source(entitlement: string): Locator {
    return this.row(entitlement).getByTestId('limit-source');
  }

  /** The usage overview card, which draws the limit under the meter of each counter. */
  usageCard(): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ hasText: /Usage Overview|Vue d.ensemble/ });
  }

  /** The limit of a counter in the usage card. */
  cardLimit(entitlement: string): Locator {
    return this.usageCard().getByRole('button', {
      name: new RegExp(`limit of ${entitlement} is composed`),
    });
  }

  /** The popover that says how a limit is composed. */
  popup(): Locator {
    return this.page.getByRole('dialog');
  }

  /** What the popover says: the arithmetic that makes the limit. */
  explanation(): Locator {
    return this.page.getByTestId('limit-provenance');
  }
}
