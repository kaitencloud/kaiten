import type { Locator, Page } from '@playwright/test';

type DeploymentZoneDetailsValues = {
  description?: string;
  name?: string;
};

export class DeploymentZoneDialogDriver {
  constructor(private readonly page: Page) {}

  deployButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Deploy', exact: true });
  }

  releaseField(): Locator {
    return this.dialog().getByRole('combobox', {
      name: 'Select a release',
      exact: true,
    });
  }

  // The entries of the open release list, as portalled out of the dialog.
  releaseOptions(): Locator {
    return this.page.getByRole('listbox').getByRole('option');
  }

  updateButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Update', exact: true });
  }

  async chooseRelease(optionName: RegExp | string) {
    await this.releaseField().click();
    await this.page.getByRole('option', { name: optionName }).click();
  }

  async fillDetails(values: DeploymentZoneDetailsValues) {
    if (values.name !== undefined) {
      await this.dialog().getByLabel('Name', { exact: true }).fill(values.name);
    }

    if (values.description !== undefined) {
      await this.dialog()
        .getByLabel('Description', { exact: true })
        .fill(values.description);
    }
  }

  private dialog() {
    return this.page.getByRole('dialog').last();
  }
}
