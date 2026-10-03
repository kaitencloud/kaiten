import type { Page } from '@playwright/test';
import type { ConnectorAppModel } from '../model/connector-app-model';
import { installMswMocks } from './install-app-mocks';

export function installConnectorAppMocks(page: Page, model: ConnectorAppModel) {
  return installMswMocks(page, 'connectors', model);
}
