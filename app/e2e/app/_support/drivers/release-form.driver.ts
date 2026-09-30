import type { Locator, Page } from '@playwright/test';

type ReleaseMetadataValues = {
  description?: string;
  version?: string;
};

export class ReleaseFormDriver {
  constructor(private readonly page: Page) {}

  chooseExistingReleaseButton(): Locator {
    return this.page.getByRole('button', {
      name: /Use existing release/,
    });
  }

  chooseScratchButton(): Locator {
    return this.page.getByRole('button', {
      name: /Start from scratch/,
    });
  }

  createButton(): Locator {
    return this.page.getByRole('button', {
      name: 'Create Release',
      exact: true,
    });
  }

  nextButton(): Locator {
    return this.page.getByRole('button', { name: 'Next', exact: true });
  }

  async clickNext() {
    await this.nextButton().click();
  }

  previousReleaseField(): Locator {
    return this.page.getByRole('combobox').first();
  }

  async chooseExistingRelease(version: string) {
    await this.chooseExistingReleaseButton().click();
    await this.previousReleaseField().click();
    await this.page.getByRole('option', { name: version, exact: true }).click();
  }

  async chooseScratchMode() {
    await this.chooseScratchButton().click();
  }

  async fillMetadata(values: ReleaseMetadataValues) {
    if (values.version !== undefined) {
      await this.page
        .getByLabel('Version', { exact: true })
        .fill(values.version);
    }

    if (values.description !== undefined) {
      await this.page
        .getByLabel('Description', { exact: true })
        .fill(values.description);
    }
  }
}
