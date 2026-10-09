import { expect, type Locator, type Page } from '@playwright/test';

/**
 * What an instance redeemed, on its Billing tab: the card with a row for each redemption
 * and the way to apply a code, and the dialog that applies one in two steps, the check and
 * the redemption, ending on what it did.
 */
export class InstanceVouchersDriver {
  constructor(private readonly page: Page) {}

  card(): Locator {
    return this.page.getByTestId('instance-vouchers');
  }

  rows(): Locator {
    return this.card()
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  row(voucherName: string): Locator {
    return this.rows().filter({ hasText: voucherName });
  }

  empty(): Locator {
    return this.page.getByTestId('instance-vouchers-empty');
  }

  error(): Locator {
    return this.page.getByTestId('instance-vouchers-error');
  }

  applyLink(): Locator {
    return this.card().getByRole('link', { name: 'Apply a code' });
  }

  revokeButton(voucherName: string): Locator {
    return this.row(voucherName).getByRole('button', { name: /^Revoke/ });
  }

  // --- The dialog that applies a code -----------------------------------------------

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async expectOpen() {
    await expect(
      this.dialog().getByRole('heading', { name: /^Apply a code to/ }),
    ).toBeVisible();
    await expect(this.codeField()).toBeVisible();
  }

  codeField(): Locator {
    return this.dialog().getByLabel(/^Voucher code/);
  }

  checkButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Check the code' });
  }

  redeemButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Redeem the code' });
  }

  validVerdict(): Locator {
    return this.page.getByTestId('redeem-verdict-valid');
  }

  invalidVerdict(): Locator {
    return this.page.getByTestId('redeem-verdict-invalid');
  }

  outcome(): Locator {
    return this.page.getByTestId('redeem-outcome');
  }

  /** The invoice the next boundary will issue, before and after, once a discount was redeemed. */
  outcomeInvoice(): Locator {
    return this.page.getByTestId('redeem-outcome-invoice');
  }

  /** The close button of the footer, which is the last: the corner of the dialog closes it too. */
  closeButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Close' }).last();
  }

  /** What the API refused, above the buttons: not the verdict, which is an alert too. */
  problem(): Locator {
    return this.dialog().locator('[data-slot="alert"][data-kind]');
  }

  async check(code: string) {
    await this.codeField().fill(code);
    await this.checkButton().click();
  }

  // --- The revocation ---------------------------------------------------------------

  reasonField(): Locator {
    return this.dialog().getByLabel(/Reason/);
  }

  confirmRevoke(): Locator {
    return this.dialog().getByRole('button', { exact: true, name: 'Revoke' });
  }
}
