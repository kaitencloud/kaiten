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

  /** The SDK's portal: the plan, what it includes and what is used, the card, the invoices. */
  portal(): Locator {
    return this.page.locator('[data-slot="customer-portal"]');
  }

  /** What the plan the organization is on costs, as the portal words it. */
  currentPlanPrice(): Locator {
    return this.portal().locator('[data-slot="current-plan-price"]');
  }

  /** The invoices of the portal, newest first. */
  invoices(): Locator {
    return this.portal().getByRole('listitem');
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
