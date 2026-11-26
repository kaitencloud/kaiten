import type { Page } from '@playwright/test';
import type { WebhooksAppModel } from '../model/webhooks-app-model';
import { installMswMocks } from './install-app-mocks';

/**
 * saas-api's outbound webhooks (`WebhooksAppModel`). A page keeps the first
 * model it is given for a slot: a spec that arms a refusal installs its own.
 */
export function installWebhooksAppMocks(page: Page, model: WebhooksAppModel) {
  return installMswMocks(page, 'webhooks', model);
}
