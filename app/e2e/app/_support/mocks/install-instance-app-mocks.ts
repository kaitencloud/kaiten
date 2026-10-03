import type { Page } from '@playwright/test';
import type { InstanceAppModel } from '../model/instance-app-model';
import { installMswMocks } from './install-app-mocks';

export function installInstanceAppMocks(page: Page, model: InstanceAppModel) {
  return installMswMocks(page, 'instances', model);
}
