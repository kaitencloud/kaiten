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
    await this.scope()
      .getByRole('button', { name: 'Next', exact: true })
      .click();
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
