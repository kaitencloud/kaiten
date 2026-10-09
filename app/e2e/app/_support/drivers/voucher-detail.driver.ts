import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The page of one voucher: its code with a copy button, what it does in plain language, what
 * was redeemed of it with the way to revoke each, and the actions its state offers (edit, add
 * a boost, publish, archive). A voucher is addressed by its id and never by its code.
 */
export class VoucherDetailDriver {
  constructor(private readonly page: Page) {}

  async goto(voucherId: string, title: string) {
    await this.page.goto(`/vouchers/${voucherId}`);
    await this.expectLoaded(title);
  }

  async expectLoaded(title: string) {
    await expect(
      this.page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
  }

  title(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** The state, written next to the name. */
  async expectState(state: string) {
    await expect(
      this.title().locator('xpath=..').getByText(state, { exact: true }),
    ).toBeVisible();
  }

  code(): Locator {
    return this.page.getByTestId('voucher-code');
  }

  copyButton(): Locator {
    return this.page.getByRole('button', { name: 'Copy the code' });
  }

  summary(): Locator {
    return this.page.getByTestId('voucher-summary');
  }

  // --- What was redeemed ------------------------------------------------------------

  redemptions(): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  redemption(instanceSlug: string): Locator {
    return this.redemptions().filter({ hasText: instanceSlug });
  }

  noRedemptions(): Locator {
    return this.page.getByTestId('voucher-redemptions-empty');
  }

  revokeButton(instanceSlug: string): Locator {
    return this.redemption(instanceSlug).getByRole('button', {
      name: /^Revoke/,
    });
  }

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  reasonField(): Locator {
    return this.dialog().getByLabel(/Reason/);
  }

  confirmRevoke(): Locator {
    return this.dialog().getByRole('button', { exact: true, name: 'Revoke' });
  }

  // --- What the state offers --------------------------------------------------------

  editLink(): Locator {
    return this.page.getByRole('link', { exact: true, name: 'Edit' });
  }

  addBoostLink(): Locator {
    return this.page.getByRole('link', { name: 'Add a boost' });
  }

  publishButton(): Locator {
    return this.page.getByRole('button', { exact: true, name: 'Publish' });
  }

  archiveButton(): Locator {
    return this.page.getByRole('button', { exact: true, name: 'Archive' });
  }

  confirmation(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async confirm(label: string) {
    await this.confirmation()
      .getByRole('button', { exact: true, name: label })
      .click();
  }

  // --- The dialog a published voucher is changed in ---------------------------------

  nameField(): Locator {
    return this.dialog().getByLabel(/^Name/);
  }

  descriptionField(): Locator {
    return this.dialog().getByLabel(/^Description/);
  }

  expiresAtField(): Locator {
    return this.dialog().getByLabel(/^Can be redeemed until/);
  }

  maxRedemptionsField(): Locator {
    return this.dialog().getByLabel(/^Maximum number of redemptions/);
  }

  saveButton(): Locator {
    return this.dialog().getByRole('button', { exact: true, name: 'Save' });
  }
}
