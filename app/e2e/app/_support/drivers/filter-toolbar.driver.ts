import { expect, type Locator, type Page } from '@playwright/test';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The search, the Filter menu and the chips of a list page, and the headers that sort
 * its table: every list of the console draws them the same way, so a driver of a list
 * page extends this one and adds what the page itself has. The filters run in the
 * browser, on the rows the page holds.
 */
export class FilterToolbarDriver {
  /** What the search of the page says it matches, in the language it is read in. */
  protected searchPlaceholder = 'Customer, instance or invoice';

  constructor(protected readonly page: Page) {}

  searchField(placeholder = this.searchPlaceholder): Locator {
    return this.page.getByPlaceholder(placeholder);
  }

  async search(term: string, placeholder?: string) {
    await this.searchField(placeholder).fill(term);
  }

  /**
   * Adds a filter from the menu of the toolbar: the Filter button where none is
   * set, the "Add filter" of the row of chips once one is. The field opens on its
   * own editor, which `pick` then works in.
   */
  async addFilter(field: string) {
    const add = this.page.getByRole('button', {
      exact: true,
      name: 'Add filter',
    });
    if ((await add.count()) > 0) {
      await add.click();
    } else {
      await this.page
        .getByRole('button', { exact: true, name: 'Filter' })
        .click();
    }
    await this.page.getByRole('option', { exact: true, name: field }).click();
  }

  /**
   * Picks an option of the editor a filter opened on. A filter with several
   * choices (Status) stays open for the next; the others close on their choice.
   */
  async pick(option: string) {
    await this.page
      .getByRole('dialog')
      .getByRole('option', { exact: true, name: option })
      .click();
  }

  /** Types a day into the date input of the editor a filter opened on. */
  async pickDay(field: string, day: string) {
    await this.page
      .getByRole('dialog')
      .getByLabel(`Filter by ${field}`, { exact: true })
      .fill(day);
  }

  async closeEditor() {
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('dialog')).toHaveCount(0);
  }

  /** Every chip of the toolbar: the scope of the URL first where a page has one, then the filters of the screen. */
  chips(): Locator {
    return this.page.locator('div.bg-secondary.rounded-full');
  }

  async expectChips(labels: string[]) {
    await expect(this.chips()).toHaveText(labels);
  }

  /** Takes a filter off, from the button of its chip: `field` is its label, as the button says it. */
  async removeFilter(field: string) {
    await this.page
      .getByRole('button', { exact: true, name: `Remove ${field} filter` })
      .click();
  }

  /** The button of the row of chips that takes every filter off. */
  reset(): Locator {
    return this.page.getByRole('button', { exact: true, name: 'Reset' });
  }

  /** Presses the header of a sortable column, by the name it shows: the first press sorts, the next reverses. */
  async sortBy(column: string) {
    await this.page
      .getByRole('columnheader')
      .filter({ hasText: new RegExp(`^${escape(column)}$`) })
      .getByRole('button')
      .click();
  }
}
