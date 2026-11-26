import { expect, type Locator, type Page } from '@playwright/test';
import { WebhooksListDriver } from './webhooks-list.driver';

// Names in English and French, so that the French spec drives the same screens.
const DELIVERIES = /^(Deliveries|Livraisons)$/;
const OPEN_DELIVERIES = /^(Deliveries of|Livraisons de) /;
const DETAIL_TITLE = /^(Delivery details|Détails de la livraison)$/;
const BODY = /^(Body sent, as JSON|Corps envoyé, en JSON|Event, as JSON)/;
const RESEND = /^(Resend|Resending…|Renvoyer|Renvoi…)$/;
const ATTEMPT = /^(Show attempt|Afficher la tentative) \d+$/;
const RESPONSE = /^(Response|Réponse) · /;
const BACK = /^(Back to deliveries|Retour aux livraisons)$/;
const VIEW_DETAILS = /^(View details|Voir les détails)$/;
const SEARCH_DELIVERIES = /^(Search deliveries|Rechercher des livraisons)$/;

/**
 * The deliveries of the outbound webhooks: the Deliveries cell of each row of
 * the list, the dialog it opens (the chronology and the selected delivery),
 * and the History tab with its detail of one attempt's delivery. The list
 * itself is `WebhooksListDriver`'s.
 */
export class WebhooksDeliveriesDriver {
  readonly list: WebhooksListDriver;

  constructor(private readonly page: Page) {
    this.list = new WebhooksListDriver(page);
  }

  async gotoList() {
    await this.list.gotoList();
  }

  async gotoHistory() {
    await this.page.goto('/integrations/webhooks/history');
    await this.list.expectLoaded();
    await expect(this.historyRows().first()).toBeVisible();
  }

  /** The button of a row's Deliveries cell, named by the webhook's host. */
  deliveriesCell(url: string): Locator {
    return this.list.row(url).getByRole('button', { name: OPEN_DELIVERIES });
  }

  /** The bars of a row's strip, oldest first. */
  stripBars(url: string): Locator {
    return this.list
      .row(url)
      .getByTestId('webhook-deliveries-strip')
      .locator('> span');
  }

  async openDeliveries(url: string) {
    await this.deliveriesCell(url).click();
    await expect(this.dialog()).toBeVisible();
  }

  dialog(): Locator {
    return this.page.getByRole('dialog', { name: DELIVERIES });
  }

  /** The chronology: the deliveries, newest first, then the webhook's dates. */
  chronology(): Locator {
    return this.dialog().getByRole('list', { name: DELIVERIES });
  }

  /** The deliveries of the chronology, newest first, milestones apart. */
  deliveries(): Locator {
    return this.chronology().getByRole('button');
  }

  /** One delivery of the chronology, by what its item reads. */
  delivery(text: string | RegExp): Locator {
    return this.deliveries().filter({ hasText: text });
  }

  async selectDelivery(text: string | RegExp) {
    await this.delivery(text).click();
    await expect(this.delivery(text)).toHaveAttribute('aria-current', 'true');
  }

  /** The detail on screen: the dialog's right pane, or the History tab's dialog. */
  detail(): Locator {
    return this.page.getByTestId('webhook-delivery-detail');
  }

  payload(): Locator {
    return this.detail().getByRole('region', { name: BODY });
  }

  async copyPayload() {
    await this.detail()
      .getByRole('button', { name: /^(Copy body|Copier le corps)$/ })
      .click();
  }

  resendButton(): Locator {
    return this.detail().getByRole('button', { name: RESEND });
  }

  /** What a disabled Resend says when it is pointed at. */
  async resendExplanation(): Promise<Locator> {
    await this.resendButton().locator('xpath=..').hover();
    return this.page.getByRole('tooltip');
  }

  async resend() {
    await this.resendButton().click();
  }

  attemptButtons(): Locator {
    return this.detail().getByRole('button', { name: ATTEMPT });
  }

  async selectAttempt(index: number) {
    await this.attemptButtons()
      .nth(index - 1)
      .click();
  }

  /** "Response · attempt i of n": which attempt the response is of. */
  responseHeading(): Locator {
    return this.detail().getByRole('heading', { name: RESPONSE });
  }

  /** The detail's way back to the chronology, on a narrow screen. */
  backButton(): Locator {
    return this.dialog().getByRole('button', { name: BACK });
  }

  async back() {
    await this.backButton().click();
  }

  /** The History tab's rows, header apart: one per attempt. */
  historyRows(): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell') });
  }

  historyRow(text: string | RegExp): Locator {
    return this.historyRows().filter({ hasText: text });
  }

  async viewDetails(row: Locator) {
    await row.getByRole('button', { name: VIEW_DETAILS }).click();
    await expect(this.historyDialog()).toBeVisible();
  }

  historyDialog(): Locator {
    return this.page.getByRole('dialog', { name: DETAIL_TITLE });
  }

  async search(text: string) {
    await this.page
      .getByRole('textbox', { name: SEARCH_DELIVERIES })
      .fill(text);
  }

  searchBox(): Locator {
    return this.page.getByRole('textbox', { name: SEARCH_DELIVERIES });
  }
}
