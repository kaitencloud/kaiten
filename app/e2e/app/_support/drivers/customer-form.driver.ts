import type { Locator, Page } from '@playwright/test';

type CustomerFormValues = {
  billingEmail?: string;
  domain?: string;
  externalCustomerId?: string;
  name?: string;
};

export class CustomerFormDriver {
  constructor(private readonly page: Page) {}

  nameField(): Locator {
    return this.page.getByLabel('Name', { exact: true });
  }

  externalIdField(): Locator {
    return this.page.getByLabel('External ID', { exact: true });
  }

  domainField(): Locator {
    return this.page.getByLabel('Domain', { exact: true });
  }

  /** Only there where billing is on: the address the invoices of the customer are addressed to. */
  billingEmailField(): Locator {
    return this.page.getByLabel('Billing e-mail', { exact: true });
  }

  createButton(): Locator {
    return this.page.getByRole('button', { name: 'Create Customer' });
  }

  updateButton(): Locator {
    return this.page.getByRole('button', { name: 'Update Customer' });
  }

  async fill(values: CustomerFormValues) {
    if (values.name !== undefined) {
      await this.nameField().fill(values.name);
    }

    if (values.externalCustomerId !== undefined) {
      await this.externalIdField().fill(values.externalCustomerId);
    }

    if (values.domain !== undefined) {
      await this.domainField().fill(values.domain);
    }

    if (values.billingEmail !== undefined) {
      await this.billingEmailField().fill(values.billingEmail);
    }
  }
}
