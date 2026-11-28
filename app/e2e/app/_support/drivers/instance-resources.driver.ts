import { expect, type Locator, type Page } from '@playwright/test';

/** What the API answered the product of a vendor that reports, reads or forgets a resource. */
export type ResourceCall = {
  body: unknown;
  replayed: boolean;
  status: number;
};

/**
 * The resources of an entitlement that counts per resource, on the Entitlements tab of an
 * instance: the caption beside the figure of its row, the drawer the URL opens
 * (`?resources=`), its pages, and the link of each resource to its usage history. It also plays
 * the vendor's product, which is the one that reports and forgets resources: the console reads
 * them, and the calls the page makes stand in for the product's own, answered by the mocks as
 * the API answers them.
 */
export class InstanceResourcesDriver {
  constructor(private readonly page: Page) {}

  /**
   * Opens the tab and waits for its table, which is drawn once the mocks answer: the calls of
   * the vendor's product below go through the same mocks, which a page not drawn yet is not
   * served by.
   */
  async goto(instanceSlug: string, search = '') {
    await this.page.goto(
      `/customers/instances/${instanceSlug}/entitlements${search}`,
    );
    // Not by role: a drawer a link opens hides what is behind it from the accessibility tree.
    await expect(this.page.locator('table').first()).toBeVisible();
  }

  /** The row of an entitlement in the table, found by what it is called. */
  row(entitlement: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ hasText: entitlement })
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  /** What the row of an entitlement says of its resources, beside its figure. */
  summary(entitlement: string): Locator {
    return this.row(entitlement).getByTestId('entitlement-resources-summary');
  }

  drawer(): Locator {
    return this.page.getByTestId('entitlement-resources');
  }

  /** The row of each resource in the drawer, in the order the API listed them. */
  rows(): Locator {
    return this.drawer()
      .getByRole('row')
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  row$(resource: string): Locator {
    return this.rows().filter({ hasText: resource });
  }

  headers(): Locator {
    return this.drawer().getByRole('columnheader');
  }

  loadMore(): Locator {
    return this.drawer().getByRole('button', { name: 'Load more resources' });
  }

  /** The link of a resource to the history of its reports. */
  historyLink(entitlement: string, resource: string): Locator {
    return this.drawer().getByRole('link', {
      name: `Usage history of ${entitlement} for ${resource}`,
    });
  }

  error(): Locator {
    return this.drawer().getByTestId('entitlement-resources-error');
  }

  empty(): Locator {
    return this.drawer().getByTestId('entitlement-resources-empty');
  }

  async open(entitlement: string) {
    await this.summary(entitlement).click();
    await expect(this.drawer()).toBeVisible();
  }

  async close() {
    await this.drawer().getByRole('button', { name: 'Close' }).first().click();
    await expect(this.drawer()).toHaveCount(0);
  }

  /**
   * Reports usage for a resource as the vendor's product does, with a call the mocks answer: the
   * counter of the resource moves, and so does what the entitlement says of its resources.
   * A page that is open reads them again when it is reloaded.
   */
  report(
    path: { entitlement: string; instance: string; resource: string },
    value: number,
    options: { behavior?: 'append' | 'set'; idempotencyKey?: string } = {},
  ): Promise<ResourceCall> {
    return this.page.evaluate(
      async ({ behavior, idempotencyKey, path, value }) => {
        const response = await fetch(
          `/api/instances/${path.instance}/entitlements/${path.entitlement}/resources/${encodeURIComponent(path.resource)}/usage`,
          {
            body: JSON.stringify({
              behavior,
              value: { type: 'number', value },
            }),
            headers: {
              'Content-Type': 'application/json',
              ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            },
            method: 'POST',
          },
        );

        return {
          body: await response.json(),
          replayed: response.headers.get('Idempotent-Replayed') === 'true',
          status: response.status,
        };
      },
      {
        behavior: options.behavior ?? 'append',
        idempotencyKey: options.idempotencyKey,
        path,
        value,
      },
    );
  }

  /** Forgets a resource as the vendor's product does when the object it stands for is deleted. */
  async forget(path: {
    entitlement: string;
    instance: string;
    resource: string;
  }): Promise<number> {
    return this.page.evaluate(async (path) => {
      const response = await fetch(
        `/api/instances/${path.instance}/entitlements/${path.entitlement}/resources/${encodeURIComponent(path.resource)}`,
        { method: 'DELETE' },
      );

      return response.status;
    }, path);
  }
}
