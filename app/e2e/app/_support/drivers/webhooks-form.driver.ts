import { expect, type Locator, type Page } from '@playwright/test';

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The create and edit page of a webhook (`/integrations/webhooks/new`,
 * `/integrations/webhooks/<id>/edit`): the Destination card with its URL and
 * the chat notice, the event picker (search, presets, groups folded by
 * default, one row per event), the Selection card and its chips, and the
 * actions. Its locators read both languages where a French spec needs them.
 */
export class WebhooksFormDriver {
  constructor(private readonly page: Page) {}

  async gotoNew() {
    await this.page.goto('/integrations/webhooks/new');
    await expect(this.heading()).toBeVisible();
  }

  async gotoEdit(webhookId: string) {
    await this.page.goto(`/integrations/webhooks/${webhookId}/edit`);
    await expect(this.heading()).toBeVisible();
  }

  heading(): Locator {
    return this.page.getByRole('heading', {
      level: 1,
      name: /^(New Webhook|Edit Webhook|Nouveau webhook|Modifier le webhook)$/,
    });
  }

  // --- Destination ---------------------------------------------------------

  url(): Locator {
    return this.page.getByRole('textbox', {
      name: /^(Webhook URL|URL du webhook)/,
    });
  }

  async fillUrl(url: string) {
    await this.url().fill(url);
  }

  /** The polite notice that a Slack or Google Chat URL receives chat messages. */
  chatNotice(): Locator {
    return this.page.getByRole('status').filter({
      hasText: /Sent as chat messages|Envoyé comme messages de chat/,
    });
  }

  /** The notice of a webhook that has no event filter and so receives every event. */
  noFilterNotice(): Locator {
    return this.page.getByRole('status').filter({
      hasText: /has no event filter|n'a pas de filtre d'événements/,
    });
  }

  // --- The picker ----------------------------------------------------------

  /** The card of the catalogue: a group named "Events". */
  picker(): Locator {
    return this.page.getByRole('group', { name: /^(Events|Événements)$/ });
  }

  searchField(): Locator {
    return this.page.getByRole('searchbox', {
      name: /^(Search events|Rechercher des événements)$/,
    });
  }

  async search(query: string) {
    await this.searchField().fill(query);
  }

  async clearSearch() {
    await this.page
      .getByRole('button', { name: /^(Clear search|Effacer la recherche)$/ })
      .first()
      .click();
  }

  /** The trigger that folds a group, named by its title then its count. */
  group(title: string): Locator {
    return this.picker().getByRole('button', {
      name: new RegExp(`^${escapeRegExp(title)} \\d+`),
    });
  }

  /** The checkbox of a whole group, or of its matches while searching. */
  groupCheckbox(title: string): Locator {
    const group = escapeRegExp(title);

    return this.picker().getByRole('checkbox', {
      name: new RegExp(`( ${group} events$|« ${group} »)`),
    });
  }

  async openGroup(title: string) {
    const trigger = this.group(title);
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }

  /** The checkbox of one event, named by its label in the page's language. */
  row(label: string): Locator {
    return this.picker().getByRole('checkbox', { name: label, exact: true });
  }

  /** Every row checkbox the picker shows: the group checkboxes apart. */
  rows(): Locator {
    return this.picker().getByRole('listitem').getByRole('checkbox');
  }

  /** A preset pill, a toggle button named by its label. */
  preset(label: string): Locator {
    return this.picker().getByRole('button', { name: label, exact: true });
  }

  // --- Selection -----------------------------------------------------------

  selection(): Locator {
    return this.page.getByRole('region', { name: /^(Selection|Sélection)$/ });
  }

  /** "3 events selected", read as a status. */
  selectionCount(): Locator {
    return this.selection().getByRole('status');
  }

  /** A chip of the Selection card, by the text it shows (a NAME, or "All 4 events"). */
  chip(name: string): Locator {
    return this.selection().getByRole('listitem').filter({ hasText: name });
  }

  async removeChip(name: string) {
    await this.chip(name).getByRole('button').click();
  }

  // --- Actions -------------------------------------------------------------

  submitButton(): Locator {
    return this.page.getByRole('button', {
      name: /^(Create Webhook|Save|Créer le webhook|Enregistrer)$/,
    });
  }

  async submit() {
    await this.submitButton().click();
  }

  async cancel() {
    await this.page.getByRole('button', { name: /^(Cancel|Annuler)$/ }).click();
  }
}
