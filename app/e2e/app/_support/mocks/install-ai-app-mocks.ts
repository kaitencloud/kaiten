import type { Page } from '@playwright/test';
import type { AiWorldModels } from '../../ai/ai.scenarios';
import type { AiAppModel } from '../model/ai-app-model';
import {
  installAiCapability,
  installFlagEvaluations,
  installMswMocks,
} from './install-app-mocks';

export function installAiAppMocks(page: Page, model: AiAppModel) {
  return installMswMocks(page, 'ai', model);
}

/**
 * Every slot of the AI world (`createAiWorldModels`): the AI area, the
 * entitlements, the licences and the instances it refers to, the capability
 * and the `ai-credits` platform flag.
 */
export async function installAiWorldMocks(page: Page, world: AiWorldModels) {
  await installAiAppMocks(page, world.ai);
  await installMswMocks(page, 'entitlements', world.entitlements);
  await installMswMocks(page, 'licenses', world.licenses);
  await installMswMocks(page, 'instances', world.instances);
  await installAiCapability(page, world.platform.capability);
  await installFlagEvaluations(page, world.platform.flags);
}
