import { expect, type Locator, type Page } from '@playwright/test';

/** A cell of the rate card, as the page writes it: `<licence>~<model slug | any>`. */
export type RateCardCellId = `${string}~${string}`;

/**
 * AI › Pricing: the rate card (`/ai/pricing`) and the rule panel beside it
 * (`?cell=`). A cell is a button named after its model, its version, its price
 * and where the price comes from; it is found by the `data-cell` the page gives
 * it, which is the value of `?cell=` and unique where names are not (three
 * Starter versions share the name "Starter").
 */
export class AiRateCardDriver {
  constructor(private readonly page: Page) {}

  async goto(search = '') {
    await this.page.goto(`/ai/pricing${search}`);
    await expect(this.grid()).toBeVisible();
  }

  heading(): Locator {
    return this.page.getByRole('heading', { level: 1, name: 'Pricing' });
  }

  grid(): Locator {
    return this.page.getByRole('table', { name: /^Rate card/ });
  }

  cell(id: RateCardCellId): Locator {
    return this.grid().locator(`[data-cell="${id}"]`);
  }

  /** A version's column head, by the text it starts with ("Business 2025"). */
  columnHeader(name: string | RegExp): Locator {
    return this.grid().getByRole('columnheader', {
      name: typeof name === 'string' ? new RegExp(`^${name}`) : name,
    });
  }

  requestTypeTab(name: string): Locator {
    return this.page
      .getByRole('tablist', { name: 'Request type' })
      .getByRole('tab', { name: new RegExp(`^${name}`) });
  }

  /** Opens the panel of a cell, and waits for it to be the one shown. */
  async openCell(id: RateCardCellId) {
    await this.cell(id).click();
    await expect(this.cell(id)).toHaveAttribute('aria-pressed', 'true');
    await expect(this.panel()).toBeVisible();
  }

  /**
   * Where a cell sits across the grid's own scroller, clear of the pinned model
   * column and of a panel laid over the grid: `whole` when all of it is in
   * sight, `starts` when its start is. Measured on the axis the page promises
   * (sideways); the page itself may scroll down to the row.
   */
  async cellInSight(id: RateCardCellId) {
    return this.cell(id).evaluate((button) => {
      const target = button.closest('td, th') as HTMLElement;
      const scroller = button.closest(
        '[data-slot="table-container"]',
      ) as HTMLElement;
      const corner = scroller.querySelector('thead th') as HTMLElement;
      const panel = document.querySelector<HTMLElement>('[data-cell-panel]');
      const box = scroller.getBoundingClientRect();
      const over =
        panel && getComputedStyle(panel).position === 'fixed'
          ? panel.getBoundingClientRect().left
          : Number.POSITIVE_INFINITY;
      const from = box.left + corner.getBoundingClientRect().width;
      const to = Math.min(box.right, over);
      const cell = target.getBoundingClientRect();

      return {
        starts: cell.left >= from - 1 && cell.left < to,
        whole: cell.left >= from - 1 && cell.right <= to + 1,
      };
    });
  }

  /** A search parameter of the page, decoded (`~` is sent as `%7E`). */
  async expectSearchParam(name: string, value: string | null) {
    await expect
      .poll(() => new URL(this.page.url()).searchParams.get(name))
      .toBe(value);
  }

  // --- The rule panel --------------------------------------------------------

  panel(): Locator {
    return this.page.getByRole('complementary').filter({
      has: this.page.getByRole('heading', { level: 2 }),
    });
  }

  async expectPanelTitle(title: string) {
    await expect(
      this.panel().getByRole('heading', { level: 2, name: title }),
    ).toBeVisible();
  }

  /** The level of the ladder that prices the cell ("Exact model · exact request type"). */
  ladderLevel(level: string): Locator {
    return this.panel()
      .getByRole('list', { name: /^Resolution ladder/ })
      .getByRole('listitem')
      .filter({ hasText: level });
  }

  /** A rate field, by its label ("Per input token"); the label ends with the API's key. */
  rate(label: string): Locator {
    return this.panel().getByRole('textbox', {
      name: new RegExp(`^${label} per[A-Z]`),
    });
  }

  panelButton(name: string | RegExp): Locator {
    return this.panel().getByRole('button', { name, exact: true });
  }

  /** Saves or adds the rule, then waits for the panel to say it is saved. */
  async submit(name: 'Save rule' | 'Add rule') {
    await expect(this.panelButton(name)).toBeEnabled();
    await this.panelButton(name).click();
  }

  // --- Unsent changes --------------------------------------------------------

  discardDialog(): Locator {
    return this.page.getByRole('alertdialog', {
      name: 'Discard your changes?',
    });
  }

  async keepEditing() {
    await this.discardDialog()
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(this.discardDialog()).toHaveCount(0);
  }

  async discard() {
    await this.discardDialog().getByRole('button', { name: 'Discard' }).click();
    await expect(this.discardDialog()).toHaveCount(0);
  }
}
