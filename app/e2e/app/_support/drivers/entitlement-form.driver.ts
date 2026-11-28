import { expect, type Locator, type Page } from '@playwright/test';

export class EntitlementFormDriver {
  constructor(private readonly page: Page) {}

  submitButton(): Locator {
    return this.scope().getByRole('button', {
      name: 'Create Entitlement',
      exact: true,
    });
  }

  /**
   * Advance from the identity step to the type step of the wizard.
   * Only present when creating, or when editing a NUMBER entitlement — a
   * non-NUMBER edit has no type step and submits from the single step.
   */
  async clickNext() {
    await this.nextButton().click();
  }

  nextButton(): Locator {
    return this.scope().getByRole('button', { name: 'Next', exact: true });
  }

  updateButton(): Locator {
    return this.scope().getByRole('button', {
      name: 'Update Entitlement',
      exact: true,
    });
  }

  nameField(): Locator {
    return this.scope().getByLabel('Name', { exact: true });
  }

  slugField(): Locator {
    return this.scope().getByLabel('Slug', { exact: true });
  }

  descriptionField(): Locator {
    return this.scope().getByLabel('Description', { exact: true });
  }

  iconPickerTrigger(): Locator {
    // Scoped to the page (not the dialog) so it also works on the configure page,
    // where the form renders inline rather than in a dialog.
    return this.page.locator('[data-field-name="icon"]').getByRole('button');
  }

  /** Open the picker, search, and select the Lucide icon with the given name. */
  async selectIcon(name: string) {
    await this.iconPickerTrigger().click();
    const popover = this.page.locator('[data-slot="popover-content"]');
    await popover.getByPlaceholder('Search icons…').fill(name);
    await popover.getByRole('button', { name, exact: true }).first().click();
  }

  async fill({ name, description }: { name: string; description?: string }) {
    await this.nameField().fill(name);
    if (description !== undefined) {
      await this.descriptionField().fill(description);
    }
  }

  userFacingToggle(): Locator {
    return this.page.getByRole('switch', { name: 'User facing' });
  }

  // base-ui's NumberField renders a text input (inputMode=numeric), so the role
  // is textbox rather than the native number input's spinbutton.
  displayOrderField(): Locator {
    return this.page.getByRole('textbox', { name: 'Display order' });
  }

  // Unit fields are labelled via aria-label and rendered on the type step of
  // the dialog as well as inline on the configure page, hence the page scope.
  unitSingularField(): Locator {
    return this.page.getByLabel('Unit (singular)', { exact: true });
  }

  unitPluralField(): Locator {
    return this.page.getByLabel('Unit (plural)', { exact: true });
  }

  saleUnitsToggle(): Locator {
    return this.page.getByRole('switch', {
      name: 'Feature is sold in different units',
    });
  }

  saleUnitSingularField(): Locator {
    return this.page.getByLabel('Sale unit (singular)', { exact: true });
  }

  saleUnitPluralField(): Locator {
    return this.page.getByLabel('Sale unit (plural)', { exact: true });
  }

  saleUnitFactorField(): Locator {
    return this.page.getByLabel('Base units per sale unit', { exact: true });
  }

  /** Fill the unit section; enables the sale-units toggle when sale values are given. */
  async fillUnits({
    unitSingular,
    unitPlural,
    saleUnitSingular,
    saleUnitPlural,
    saleUnitFactor,
  }: {
    unitSingular: string;
    unitPlural: string;
    saleUnitSingular?: string;
    saleUnitPlural?: string;
    saleUnitFactor?: number;
  }) {
    await this.unitSingularField().fill(unitSingular);
    await this.unitPluralField().fill(unitPlural);

    if (
      saleUnitSingular === undefined &&
      saleUnitPlural === undefined &&
      saleUnitFactor === undefined
    ) {
      return;
    }

    if (!(await this.saleUnitsToggle().isChecked())) {
      await this.saleUnitsToggle().click();
    }
    if (saleUnitSingular !== undefined) {
      await this.saleUnitSingularField().fill(saleUnitSingular);
    }
    if (saleUnitPlural !== undefined) {
      await this.saleUnitPluralField().fill(saleUnitPlural);
    }
    if (saleUnitFactor !== undefined) {
      await this.saleUnitFactorField().fill(String(saleUnitFactor));
    }
  }

  // The two reset selects are base-ui Selects, so they are reached through the
  // FormItem's data-field-name rather than a label association, the same way
  // the icon picker is.
  resetPeriodTrigger(): Locator {
    return this.page
      .locator('[data-field-name="resetPeriod"]')
      .getByRole('combobox');
  }

  resetAnchorTrigger(): Locator {
    return this.page
      .locator('[data-field-name="resetAnchor"]')
      .getByRole('combobox');
  }

  /** Open a reset select and pick the option with the given visible label. */
  async selectResetPeriod(label: string) {
    await this.resetPeriodTrigger().click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  async selectResetAnchor(label: string) {
    await this.resetAnchorTrigger().click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  // Where the usage of a NUMBER entitlement comes from: calculated, or combined.
  usageSourceTrigger(): Locator {
    return this.page
      .locator('[data-field-name="usageSource"]')
      .getByRole('combobox');
  }

  async selectUsageSource(label: 'Calculated' | 'Combined') {
    await this.usageSourceTrigger().click();
    await this.page.getByRole('option', { name: label, exact: true }).click();
  }

  /** The aggregation method of a NUMBER entitlement: greyed, on Sum, for a combined one. */
  aggregationTrigger(): Locator {
    return this.page
      .locator('[data-field-name="aggregationMethod"]')
      .getByRole('combobox');
  }

  // --- The sources of a combined entitlement ---------------------------------------

  sourceRows(): Locator {
    return this.page.getByTestId('entitlement-source-row');
  }

  /** One line of the sources, by its position from 1. */
  sourceRow(position: number): Locator {
    return this.page.getByRole('group', { name: `Source ${position}` });
  }

  private sourceTrigger(position: number): Locator {
    return this.sourceRow(position).getByRole('button', {
      name: /^Entitlement/,
    });
  }

  /** What a line shows as its entitlement: its name, or the prompt while nothing is chosen. */
  sourceEntitlement(position: number): Locator {
    return this.sourceTrigger(position);
  }

  /** The lists of entitlements a line offers, one while it is open and none once it has left. */
  private sourceLists(): Locator {
    return this.page.getByRole('listbox', { name: 'Search entitlements' });
  }

  async chooseSource(position: number, name: string) {
    await this.sourceTrigger(position).click();
    await this.sourceLists()
      .last()
      .getByRole('option', { exact: true, name })
      .click();
    await expect(this.sourceLists()).toHaveCount(0);
  }

  /** The entitlements the picker of a line offers. */
  async offeredSources(position: number): Promise<string[]> {
    await this.sourceTrigger(position).click();
    const names = await this.sourceLists()
      .last()
      .getByRole('option')
      .allInnerTexts();
    await this.page.keyboard.press('Escape');
    await expect(this.sourceLists()).toHaveCount(0);

    return names.map((name) => name.trim()).sort();
  }

  sourceWeight(position: number): Locator {
    return this.sourceRow(position).getByLabel('Weight');
  }

  async setSourceWeight(position: number, weight: string) {
    await this.sourceWeight(position).fill(weight);
  }

  addSourceButton(): Locator {
    return this.page.getByRole('button', { name: 'Add a source' });
  }

  removeSourceButton(position: number): Locator {
    return this.page.getByRole('button', {
      name: `Remove source ${position}`,
    });
  }

  /** The window the sources share, which the API derives and the form cannot choose. */
  combinedWindow(): Locator {
    return this.page.getByTestId('combined-window');
  }

  /** What is said before the button that saves new sources or weights. */
  revalueHint(): Locator {
    return this.page.getByTestId('combined-revalue-hint');
  }

  /** The offer to take back what was typed and not sent (creation page only). */
  recoveryOffer(): Locator {
    return this.page
      .getByRole('status')
      .filter({ hasText: 'Pick up where you left off?' });
  }

  resumeButton(): Locator {
    return this.page.getByRole('button', { name: 'Resume', exact: true });
  }

  startOverButton(): Locator {
    return this.page.getByRole('button', { name: 'Start over', exact: true });
  }

  /**
   * The keyboard is on a field of the form: neither on the page body, which is where it
   * falls when the button that was pressed leaves the page, nor on the alert.
   */
  async expectFocusOnAField() {
    await expect
      .poll(() =>
        this.page.evaluate(() => {
          const active = document.activeElement;

          return (
            active?.closest('form') !== null &&
            active?.closest('[data-slot="alert"]') === null &&
            active?.matches('input, textarea, select, [role="combobox"]') ===
              true
          );
        }),
      )
      .toBe(true);
  }

  async expectLoaded(mode: 'create' | 'update' = 'create') {
    const heading =
      mode === 'create' ? 'New Entitlement' : 'Update Entitlement';
    await expect(
      this.page.getByRole('heading', { name: heading }),
    ).toBeVisible();
  }

  // The open dialog when there is one (editing), the page otherwise: creating
  // happens on its own page.
  private scope() {
    return this.page.locator('[role="dialog"], main').last();
  }
}
