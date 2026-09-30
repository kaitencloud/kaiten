import { expect, type Locator, type Page } from '@playwright/test';

type InstanceDetailsValues = {
  description?: string;
  name?: string;
};

/**
 * Driver for the instance create/edit stepper.
 *
 * Historical context: this driver used to wrap `clickNext`, `clickCreate` and
 * `setTextValue` with `evaluate(...)` and `keyboard.type` hacks because the
 * stacked stepper kept past steps positioned absolutely on top of the active
 * panel — that broke Playwright's actionability checks for buttons near the
 * panel edges, and obscured inputs at scroll-time.
 *
 * The underlying UI was fixed in `step-stack-step.tsx` by setting
 * `pointer-events: none` on inactive steps, which restores normal Playwright
 * `.click()` and `.fill()` behaviour. This driver is now a thin wrapper.
 */
export class InstanceFormDriver {
  constructor(private readonly page: Page) {}

  nameField(): Locator {
    return this.page.getByLabel('Name', { exact: true });
  }

  descriptionField(): Locator {
    return this.page.getByLabel('Description', { exact: true });
  }

  customerField(): Locator {
    return this.fieldTrigger('customerId');
  }

  licenseField(): Locator {
    return this.fieldTrigger('licenseSlug');
  }

  // Creation form only: on an existing instance the zone moves through the
  // deploy / migrate action instead.
  deploymentZoneField(): Locator {
    return this.fieldTrigger('deploymentZoneId');
  }

  lifecycleStageField(): Locator {
    return this.fieldTrigger('lifecycleStage');
  }

  nextButton(): Locator {
    return this.page.getByRole('button', { name: 'Next', exact: true }).last();
  }

  previousButton(): Locator {
    return this.page
      .getByRole('button', { name: 'Previous', exact: true })
      .last();
  }

  createButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Create Instance',
      exact: true,
    });
  }

  updateButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Update Instance',
      exact: true,
    });
  }

  async fillDetails(values: InstanceDetailsValues) {
    if (values.name !== undefined) {
      await this.nameField().fill(values.name);
    }

    if (values.description !== undefined) {
      await this.descriptionField().fill(values.description);
    }
  }

  async chooseCustomer(customerName: string) {
    await this.customerField().click();
    await this.page
      .locator('[data-slot="command-item"]')
      .filter({ hasText: customerName })
      .first()
      .click();
  }

  async chooseDeploymentZone(zoneLabel: string) {
    await this.deploymentZoneField().click();
    await this.page
      .locator('[data-slot="command-item"]')
      .filter({ hasText: zoneLabel })
      .first()
      .click();
  }

  // The zone is optional, so the picker carries an entry that takes it back
  // to none.
  async clearDeploymentZone() {
    await this.deploymentZoneField().click();
    await this.page
      .getByRole('option', { name: 'No deployment zone', exact: true })
      .click();
  }

  async chooseLifecycleStage(stageLabel: string) {
    await this.lifecycleStageField().click();
    await this.page
      .locator('[data-slot="command-item"]')
      .filter({ hasText: stageLabel })
      .first()
      .click();
  }

  // Only offered before the instance exists: PATCH refuses to take a stage
  // back to unset.
  async clearLifecycleStage() {
    await this.lifecycleStageField().click();
    await this.page
      .getByRole('option', { name: 'No lifecycle stage', exact: true })
      .click();
  }

  // Metadata inputs are rendered by <DynamicForm> from the field schema, so
  // they are addressed by their declared label rather than a form field name.
  async fillMetadataText(label: string, value: string) {
    await this.page.getByLabel(label, { exact: true }).fill(value);
  }

  // Options read "<name> v<version>": versions of one product share a name,
  // so the name alone would not tell them apart.
  async chooseLicense(optionLabel: string) {
    await this.licenseField().click();
    await this.page
      .getByRole('option', { name: optionLabel, exact: true })
      .click();
  }

  async expectStepVisible(stepTitle: string) {
    await expect(
      this.page.getByRole('heading', { name: stepTitle, exact: true }).last(),
    ).toBeVisible();
  }

  async clickNext() {
    await this.nextButton().click();
  }

  async clickCreate() {
    await this.createButton().click();
  }

  /**
   * Resolve a field group by its TanStack Form `name`. Stable across label
   * renames, locale switches, and DOM wrapper churn — `data-field-name` is
   * set by the shared `<FormField>` wrapper.
   */
  private fieldGroup(fieldName: string) {
    return this.page.locator(`[data-field-name="${fieldName}"]`).first();
  }

  private fieldTrigger(fieldName: string) {
    return this.fieldGroup(fieldName)
      .locator('[role="combobox"], button')
      .first();
  }
}
