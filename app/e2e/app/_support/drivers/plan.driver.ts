import type { Locator, Page } from '@playwright/test';

/**
 * The Plan & usage page (`/settings/plan`): the organization's Kaiten Cloud plan, drawn
 * by Kaiten's React SDK (the portal, the plans it can move to, the checkout of the one
 * chosen), or the card that says why saas-api minted no session for it. The SDK's
 * parts are found by the `data-slot` it documents as their hook; its words are its
 * own, in English unless a spec starts the console in another language.
 */
export class PlanPageDriver {
  constructor(private readonly page: Page) {}

  async goto(search = '') {
    await this.page.goto(`/settings/plan${search}`);
  }

  heading(name = 'Plan & usage'): Locator {
    return this.page.getByRole('heading', { level: 1, name });
  }

  /** The card of a refused session, which names the refusal in `data-problem`. */
  problem(): Locator {
    return this.page.getByTestId('plan-session-problem');
  }

  /**
   * The SDK's portal, which the page draws in two parts around the usage: the plan and what
   * it includes, then the add-ons, the card, the voucher and the invoices. It is two elements
   * (`first()` and `last()` tell them apart), so a spec reads a card through its own locator.
   */
  portal(): Locator {
    return this.page.locator('[data-slot="customer-portal"]');
  }

  /** What the plan the organization is on costs, as the portal words it. */
  currentPlanPrice(): Locator {
    return this.portal().locator('[data-slot="current-plan-price"]');
  }

  /**
   * One card of the SDK, found by its title: the styled cards carry no hook of their own,
   * only the one of every card and of its title.
   */
  private card(title: string): Locator {
    return this.page.locator('[data-slot="card"]').filter({
      has: this.page.locator('[data-slot="card-title"]', { hasText: title }),
    });
  }

  /** The card of the plan the organization is on: its name, price and renewal. */
  currentPlan(title = 'Current plan'): Locator {
    return this.card(title);
  }

  /** The card of the plan's features, and of the quotas something caps. */
  includedFeatures(title = 'Included features'): Locator {
    return this.card(title);
  }

  /** The card of the payment method the invoices are charged to. */
  paymentMethod(title = 'Payment method'): Locator {
    return this.card(title);
  }

  /** The invoices of the portal, newest first. */
  invoices(): Locator {
    return this.portal().getByRole('listitem');
  }

  /**
   * The SDK's usage block (`LicenseUsage`): the plan's name, and one row for each numeric
   * quota with what the organization has used of it, the unlimited ones included.
   */
  usage(): Locator {
    return this.page.locator('[data-slot="license-usage"]');
  }

  /** One quota of the usage block, by the name Kaiten gives it. */
  usageRow(name: string): Locator {
    return this.usage()
      .locator('[data-slot="license-usage-quota"]')
      .filter({ hasText: name });
  }

  /**
   * The portal's own meters, which draw the quotas something caps and leave the unlimited
   * ones out: the page draws the usage block in their place, so there are none.
   */
  usageMeters(title = 'Usage meters'): Locator {
    return this.card(title);
  }

  /** The console's own section around the plans and the checkout. */
  change(name = 'Change plan'): Locator {
    return this.page.getByRole('region', { name });
  }

  /** The SDK's table of the plans the organization can move to. */
  plans(): Locator {
    return this.change().locator('[data-slot="pricing-table"]');
  }

  /** The SDK's checkout of the plan the address names. */
  checkout(): Locator {
    return this.page.locator('[data-slot="checkout-flow"]');
  }

  /** What the checkout says is due today, as the server priced it. */
  dueToday(): Locator {
    return this.checkout().getByRole('status');
  }

  async selectPlan(name = 'Select plan') {
    await this.page.getByRole('button', { name }).click();
  }
}
