import { expect, type Locator, type Page } from '@playwright/test';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class NotificationsDriver {
  constructor(private readonly page: Page) {}

  bellButton(): Locator {
    return this.page.getByRole('button', { name: /^Notifications(,|$)/ });
  }

  bellBadge(): Locator {
    return this.bellButton().locator('span');
  }

  panel(): Locator {
    return this.page.locator('[data-slot="popover-content"]');
  }

  async openPanel() {
    await this.bellButton().click();
    await expect(
      this.panel().getByRole('heading', { name: 'Notifications' }),
    ).toBeVisible();
  }

  panelItem(title: string): Locator {
    return this.panel().getByRole('button', {
      name: new RegExp(escapeRegExp(title)),
    });
  }

  async gotoFeed() {
    await this.page.goto('/notifications');
    await this.expectFeedLoaded();
  }

  async expectFeedLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Notifications', level: 1 }),
    ).toBeVisible();
  }

  feedItem(title: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(escapeRegExp(title)),
    });
  }

  objectFilterChip(): Locator {
    return this.page.getByRole('button', { name: /^Object\b/ });
  }

  /** Ticks one kind of object in the object filter's quick-access chip. */
  async filterByObject(objectLabel: string) {
    // The chip opens straight onto the list of objects.
    await this.objectFilterChip().click();
    await this.page.getByRole('option', { name: objectLabel }).click();
    await this.page.keyboard.press('Escape');
  }

  markAllReadButton(): Locator {
    return this.page.getByRole('button', { name: 'Mark all as read' });
  }

  unreadFilter(): Locator {
    return this.page.getByRole('button', { name: /^Unread( \(\d+\))?$/ });
  }

  async gotoPreferences() {
    await this.page.goto('/settings/notifications');
    await expect(
      this.page.getByRole('heading', { name: 'Notifications', level: 1 }),
    ).toBeVisible();
  }

  preferenceSwitch(eventLabel: string): Locator {
    return this.page.getByRole('switch', { name: eventLabel, exact: true });
  }

  /**
   * Resolves once the next preferences save is answered, and checks that it
   * succeeded. Start it before the click that saves, then await it.
   */
  async waitForPreferencesSave() {
    const response = await this.page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'PUT' &&
        new URL(candidate.url()).pathname.endsWith(
          '/api/v1/notification-preferences',
        ),
    );
    expect(response.status()).toBe(200);
  }

  /** The button a preferences group's title is, which folds its events away. */
  preferenceGroup(groupLabel: string): Locator {
    // Its name is the title followed by the group's description, which can
    // name another group ("… across your instances"): match the start only.
    // Not the entry of the side navigation that has the same name as the group of billing.
    const escaped = groupLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.page
      .getByRole('button', { name: new RegExp(`^${escaped}`) })
      .and(this.page.locator('[data-slot="accordion-trigger"]'));
  }

  async expectBellUnreadCount(count: number) {
    await expect(this.bellBadge().first()).toHaveText(String(count));
  }

  async expectNoBellBadge() {
    await expect(this.bellBadge()).toHaveCount(0);
  }
}
