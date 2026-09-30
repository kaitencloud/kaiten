import { expect, type Locator, type Page } from '@playwright/test';

type FeatureFlagGeneralValues = {
  description?: string;
  name?: string;
  slug?: string;
};

type BasicTargetingValues = {
  name: string;
  rule: string;
  variant: string;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class FeatureFlagFormDriver {
  constructor(private readonly page: Page) {}

  createButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Create Feature Flag',
      exact: true,
    });
  }

  updateButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Update Feature Flag',
      exact: true,
    });
  }

  // --- Create stepper -------------------------------------------------------
  // Create mode (`/feature-flags/new`) renders a guided stepper, not tabs:
  // only the current step is mounted, so its fields are addressed directly and
  // navigation happens through the "Next" button. (Edit mode keeps the
  // tab-based helpers below.)

  async clickNext() {
    await this.page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  async fillGeneralStep(values: FeatureFlagGeneralValues) {
    if (values.name !== undefined) {
      await this.page.getByLabel('Name', { exact: true }).fill(values.name);
    }

    if (values.description !== undefined) {
      await this.page
        .getByLabel('Description', { exact: true })
        .fill(values.description);
    }

    if (values.slug !== undefined) {
      await this.page.getByLabel('Slug', { exact: true }).fill(values.slug);
    }
  }

  async chooseDefaultVariantStep(variantName: string) {
    await this.labelledTrigger(
      this.page.locator('body'),
      'Default Variant',
    ).click();
    await this.page
      .getByRole('option', { name: variantName, exact: true })
      .click();
  }

  // --- Edit tabs ------------------------------------------------------------

  async fillGeneral(values: FeatureFlagGeneralValues) {
    await this.openTab('Basic Information');

    if (values.name !== undefined) {
      await this.activeTabPanel()
        .getByLabel('Name', { exact: true })
        .fill(values.name);
    }

    if (values.description !== undefined) {
      await this.activeTabPanel()
        .getByLabel('Description', { exact: true })
        .fill(values.description);
    }

    if (values.slug !== undefined) {
      await this.activeTabPanel()
        .getByLabel('Slug', { exact: true })
        .fill(values.slug);
    }
  }

  async chooseDefaultVariant(variantName: string) {
    await this.openTab('Default Variant');
    // `default_variant` is rendered outside the standard `FormField` wrapper
    // (no `data-field-name`), so we still target it by its <label>.
    await this.labelledTrigger(
      this.activeTabPanel(),
      'Default Variant',
    ).click();
    await this.page
      .getByRole('option', { name: variantName, exact: true })
      .click();
  }

  async openCreateTargetingDialog() {
    await this.openTab('Targeting Rules');
    const addFirstRuleButton = this.activeTabPanel().getByRole('button', {
      name: 'Add First Rule',
      exact: true,
    });

    if ((await addFirstRuleButton.count()) > 0) {
      await addFirstRuleButton.click();
    } else {
      await this.activeTabPanel()
        .getByRole('button', { name: 'Add Rule', exact: true })
        .click();
    }

    await expect(
      this.page.getByRole('heading', { name: 'Create Targeting Rule' }),
    ).toBeVisible();
  }

  async fillBasicTargeting(values: BasicTargetingValues) {
    const dialog = this.targetingDialog();

    await dialog.getByLabel('Name', { exact: true }).fill(values.name);

    // The rule field is a clickable preview; Monaco only exists inside the
    // dedicated editor dialog it opens, and the draft lands in the form on
    // Apply.
    await dialog
      .locator('[data-field-name="rule"]')
      .getByRole('button', { name: 'Edit the rule' })
      .click();
    const celDialog = this.page
      .getByRole('dialog')
      .filter({ has: this.page.getByRole('heading', { name: 'CEL rule' }) });
    await expect(
      celDialog.getByText('Loading editor...', { exact: true }),
    ).toBeHidden({ timeout: 30_000 });
    const editor = celDialog.locator('.monaco-editor').last();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click({ timeout: 30_000 });
    await this.page.keyboard.insertText(values.rule);
    await celDialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(celDialog).toBeHidden();
    // `variant` is a SelectField wrapped in FormField, so it exposes
    // `data-field-name="variant"`. Far more stable than xpath following.
    await dialog
      .locator('[data-field-name="variant"]')
      .getByRole('combobox')
      .click();
    await this.page
      .getByRole('option', {
        name: new RegExp(`^${escapeRegExp(values.variant)}\\s-`),
      })
      .click();
  }

  async saveTargetingDialog() {
    await this.targetingDialog()
      .getByRole('button', { name: 'Save', exact: true })
      .click();
  }

  async expectTargetingRuleVisible(ruleName: string) {
    await this.openTab('Targeting Rules');
    await expect(
      this.activeTabPanel().getByText(ruleName, { exact: true }),
    ).toBeVisible();
  }

  async openTab(tabLabel: string) {
    await this.page.getByRole('tab', { name: tabLabel, exact: true }).click();
  }

  private activeTabPanel() {
    return this.page.locator('[role="tabpanel"][data-state="active"]').last();
  }

  private labelledTrigger(scope: Locator, label: string) {
    return scope
      .locator('label')
      .filter({
        hasText: new RegExp(`^${escapeRegExp(label)}(?:\\s*\\*)?$`),
      })
      .first()
      .locator('xpath=following::*[@role="combobox" or self::button][1]');
  }

  private targetingDialog() {
    return this.page.getByRole('dialog').last();
  }
}
