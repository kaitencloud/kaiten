import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The wizard that makes a voucher, in four steps (kind, offer, who and when, review), and
 * the page that follows a publication with the code to copy. Each step is drawn in a card
 * whose title says where the person is.
 */
export class VoucherWizardDriver {
  constructor(private readonly page: Page) {}

  async goto(search = '') {
    await this.page.goto(`/vouchers/new${search}`);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible();
  }

  /** The title of the step that is open. */
  stepTitle(): Locator {
    return this.page.locator('[data-slot="card-title"]');
  }

  async expectStep(title: string) {
    await expect(this.stepTitle()).toHaveText(title);
  }

  /** A step of the strip above the wizard, which leads back to a step already reached. */
  stepper(name: 'Kind' | 'Offer' | 'Review' | 'Who and when'): Locator {
    return this.page.getByRole('button', { name: new RegExp(name) });
  }

  next(): Locator {
    return this.page.getByRole('button', { name: /^Next/ });
  }

  back(): Locator {
    return this.page.getByRole('button', { name: 'Back' });
  }

  // --- The kind ---------------------------------------------------------------------

  kind(name: 'Boost' | 'Bundle' | 'Discount' | 'Feature grant'): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${name}`) });
  }

  nameField(): Locator {
    return this.page.getByLabel(/^Name/);
  }

  descriptionField(): Locator {
    return this.page.getByLabel(/^Description/);
  }

  /** Fills the first step and goes on to the offer. */
  async startAs(kind: 'Boost' | 'Discount', name: string) {
    await this.kind(kind).click();
    await this.nameField().fill(name);
    await this.next().click();
    await this.expectStep('Offer');
  }

  // --- The offer of a discount ------------------------------------------------------

  discountType(name: 'A fixed amount' | 'A percentage'): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${name}`) });
  }

  percentageField(): Locator {
    return this.page.getByLabel(/^Percentage/);
  }

  amountField(): Locator {
    return this.page.getByLabel(/^Amount/);
  }

  currencyField(): Locator {
    return this.page
      .getByRole('button', { name: /Choose a currency|^[A-Z]{3}$/ })
      .first();
  }

  async chooseCurrency(code: string) {
    await this.currencyField().click();
    await this.page.getByRole('option', { exact: true, name: code }).click();
  }

  appliesTo(
    name: 'Both' | 'Chosen prices' | 'The add-ons' | 'The base price',
  ): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${name}`) });
  }

  priceList(): Locator {
    return this.page.getByRole('list', {
      name: 'Prices the discount applies to',
    });
  }

  // --- How long ---------------------------------------------------------------------

  durationField(): Locator {
    return this.page.getByRole('combobox', { name: /How long does it last/ });
  }

  async chooseDuration(option: 'A number of times' | 'Once' | 'With no end') {
    await this.durationField().click();
    await this.page.getByRole('option', { exact: true, name: option }).click();
  }

  /** The number of invoices of a discount, or of billing periods of a boost. */
  timesField(): Locator {
    return this.page.getByLabel(/^Number of (invoices|billing periods)/);
  }

  // --- The offer of a boost ---------------------------------------------------------

  addChange(): Locator {
    return this.page.getByRole('button', { name: /Add a change/ });
  }

  changes(): Locator {
    return this.page.getByTestId('voucher-grant-row');
  }

  change(index: number): Locator {
    return this.changes().nth(index);
  }

  async chooseEntitlement(index: number, name: string) {
    await this.change(index)
      .getByRole('button', { name: /Choose an entitlement|^(?!Remove)/ })
      .first()
      .click();
    // The list of a change that was closed may still be leaving: the one just opened is the last.
    await this.page.getByRole('option', { exact: true, name }).last().click();
  }

  /** The entitlements the picker of a change offers. */
  async offeredEntitlements(index: number): Promise<string[]> {
    await this.change(index).getByRole('button').first().click();
    const names = await this.page.getByRole('option').allInnerTexts();
    await this.page.keyboard.press('Escape');

    return names.map((name) => name.trim());
  }

  modifier(index: number): Locator {
    return this.change(index).getByRole('combobox', { name: /Change/ });
  }

  async chooseModifier(
    index: number,
    option: 'Add' | 'Make unlimited' | 'Multiply by' | 'Set to',
  ) {
    await this.modifier(index).click();
    await this.page.getByRole('option', { exact: true, name: option }).click();
  }

  valueField(index: number): Locator {
    return this.change(index).getByLabel(/^Value/);
  }

  // --- Who and when -----------------------------------------------------------------

  codeField(): Locator {
    return this.page.getByLabel(/^Custom code/);
  }

  weakCodeWarning(): Locator {
    return this.page.getByTestId('weak-code-warning');
  }

  maxRedemptionsField(): Locator {
    return this.page.getByLabel(/^Maximum number of redemptions/);
  }

  restrictedCustomerField(): Locator {
    return this.page
      .getByRole('button', { name: /Any customer|Hooli|Initech/ })
      .first();
  }

  async reserveFor(customer: string) {
    await this.restrictedCustomerField().click();
    await this.page
      .getByRole('option', { exact: true, name: customer })
      .click();
  }

  annualOnly(): Locator {
    return this.page.getByRole('checkbox', {
      name: /Annual subscriptions only/,
    });
  }

  // --- The review and what follows --------------------------------------------------

  /** The voucher in plain language, one sentence a line. */
  review(): Locator {
    return this.page.getByTestId('voucher-review');
  }

  /** The code the voucher will have: the one typed, or the word that says one is generated. */
  reviewCode(code: string): Locator {
    return this.page.getByText(code, { exact: true });
  }

  publishButton(): Locator {
    return this.page.getByRole('button', { name: 'Publish', exact: true });
  }

  saveDraftButton(): Locator {
    return this.page.getByRole('button', { name: 'Save as a draft' });
  }

  /** The page that follows a publication. */
  published(): Locator {
    return this.page.getByTestId('voucher-published');
  }

  code(): Locator {
    return this.page.getByTestId('voucher-code');
  }

  copyButton(): Locator {
    return this.page.getByRole('button', { name: 'Copy the code' });
  }

  addBoostLink(): Locator {
    return this.page.getByRole('link', { name: 'Add a boost' });
  }

  viewLink(): Locator {
    return this.page.getByRole('link', { name: 'View the voucher' });
  }

  makeAnother(): Locator {
    return this.page.getByRole('button', { name: 'Make another voucher' });
  }

  /** The words of an error, which sit under the field they are about. */
  error(message: string | RegExp): Locator {
    return this.page.getByText(message);
  }
}
