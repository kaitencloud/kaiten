import type { Locator, Page } from '@playwright/test';

/**
 * The offer of a creation form to take back what was typed and not sent, which every
 * form that adopted the recovery draws the same way: in English, "Pick up where you
 * left off?" with Resume and Start over.
 */
export class FormRecoveryDriver {
  constructor(private readonly page: Page) {}

  offer(): Locator {
    return this.page
      .getByRole('status')
      .filter({ hasText: 'Pick up where you left off?' });
  }

  resumeButton(): Locator {
    return this.page.getByRole('button', { name: 'Resume', exact: true });
  }

  startOverButton(): Locator {
    return this.page.getByRole('button', { name: 'Start over', exact: true });
  }
}
