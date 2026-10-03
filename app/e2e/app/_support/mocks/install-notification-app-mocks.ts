import type { Page } from '@playwright/test';
import type { NotificationAppModel } from '../model/notification-app-model';
import { installMswMocks } from './install-app-mocks';

export function installNotificationAppMocks(
  page: Page,
  model: NotificationAppModel,
) {
  return installMswMocks(page, 'notifications', model);
}
