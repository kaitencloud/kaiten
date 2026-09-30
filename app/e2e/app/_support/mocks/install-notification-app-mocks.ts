import type { Page } from '@playwright/test';
import type { NotificationAppModel } from '../model/notification-app-model';
import { tryInstallMswMocks } from './install-app-mocks';

export async function installNotificationAppMocks(
  page: Page,
  model: NotificationAppModel,
) {
  if (await tryInstallMswMocks(page, 'notifications', model)) {
    return;
  }

  throw new Error(
    'Notification mocks require MSW mode: the SSE stream cannot be served ' +
      'through the legacy page.route interception (E2E_MOCKS=page-route).',
  );
}
