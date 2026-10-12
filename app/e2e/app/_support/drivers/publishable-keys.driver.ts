import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The page of the publishable keys (`/integrations/publishable-keys`): the keys of the
 * organization with what tells them apart, the dialog that issues one and ends on the key
 * itself, the dialog that changes one and the confirmation that revokes one.
 */
export class PublishableKeysDriver {
  constructor(private readonly page: Page) {}

  async goto(search = '') {
    await this.page.goto(`/integrations/publishable-keys${search}`);
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Publishable keys' }),
    ).toBeVisible();
  }

  /** The words that say what a key is for, and the links to the switches that decide what it lists. */
  intro(): Locator {
    return this.page.getByTestId('publishable-keys-intro');
  }

  /** The rows of the table, header apart. */
  rows(): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  /** One row, found by the label of its key. */
  row(label: string): Locator {
    return this.rows().filter({ hasText: label });
  }

  /** A row of the list while a dialog stands over it: the dialog hides the page behind it from the roles. */
  rowBehindDialog(label: string): Locator {
    return this.page.locator('tr').filter({ hasText: label });
  }

  searchField(): Locator {
    return this.page.getByPlaceholder('Search by label, key ending or origin');
  }

  includeRevoked(): Locator {
    return this.page.getByRole('switch', { name: 'Include revoked' });
  }

  empty(): Locator {
    return this.page.getByTestId('publishable-keys-empty');
  }

  filteredEmpty(): Locator {
    return this.page.getByTestId('publishable-keys-filtered-empty');
  }

  // --- Issuing a key -----------------------------------------------------------------

  /** The call to issue a key: a link, since the dialog has an address of its own. */
  newKey(): Locator {
    return this.page.getByRole('link', { name: 'New publishable key' }).first();
  }

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  labelField(): Locator {
    return this.dialog().getByLabel(/^(Label|Libellé)/);
  }

  originsField(): Locator {
    return this.dialog().getByLabel(/^(Allowed origins|Origines autorisées)/);
  }

  async fill({ label, origins }: { label?: string; origins?: string[] }) {
    if (label !== undefined) {
      await this.labelField().fill(label);
    }
    if (origins !== undefined) {
      await this.originsField().fill(origins.join('\n'));
    }
  }

  createButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Create key' });
  }

  saveButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Save' });
  }

  /** The entries the origins field names as no origin. */
  rejectedOrigins(): Locator {
    return this.dialog().getByTestId('rejected-origins');
  }

  // --- The key, once -----------------------------------------------------------------

  /** The field the key is read in, once, after it was issued. */
  createdKey(): Locator {
    return this.dialog().getByTestId('created-key');
  }

  copyKey(): Locator {
    return this.dialog().getByRole('button', { name: 'Copy the key' });
  }

  done(): Locator {
    return this.dialog().getByRole('button', { name: 'Done' });
  }

  /** The question asked before a key that was not copied is dismissed. */
  leaveQuestion(): Locator {
    return this.page.getByRole('alertdialog', {
      name: 'Close without the key?',
    });
  }

  // --- Changing and revoking a key ---------------------------------------------------

  editLink(label: string): Locator {
    return this.row(label).getByRole('link', { name: `Edit ${label}` });
  }

  revokeButton(label: string): Locator {
    return this.row(label).getByRole('button', { name: `Revoke ${label}` });
  }

  confirmation(): Locator {
    return this.page.getByRole('alertdialog');
  }

  confirmRevoke(): Locator {
    return this.confirmation().getByRole('button', { name: 'Revoke key' });
  }
}
