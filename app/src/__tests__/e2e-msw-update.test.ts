import type { Page } from '@playwright/test';
import type { RequestHandler } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { startE2EMockServiceWorker } from '@/e2e/msw/browser';
import { updateBillingAppMocks } from '../../e2e/app/_support/mocks/install-billing-app-mocks';
import { E2E_MSW_STORAGE_KEY, type E2EMswConfig } from '../../e2e/app/_support/contracts/msw-slots';
import { BillingAppModel } from '../../e2e/app/_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../../e2e/app/_support/model/billing-capabilities';
import { server } from './msw-server';

const { resetHandlers, setupWorker } = vi.hoisted(() => {
  const resetHandlers = vi.fn<(...handlers: RequestHandler[]) => void>();
  return {
    resetHandlers,
    setupWorker: vi.fn((..._handlers: RequestHandler[]) => ({
      resetHandlers,
      start: vi.fn(async () => {}),
    })),
  };
});
vi.mock('msw/browser', () => ({ setupWorker }));

const page = {
  evaluate: async (fn: (arg: unknown) => Promise<void>, arg: unknown) => fn(arg),
} as unknown as Page;
const target = window as Window & {
  __KAITEN_MSW_RUNNING__?: unknown;
  __KAITEN_MSW_UPDATE__?: unknown;
};
const capabilities = async () => (await fetch('http://api.test/api/billing/capabilities')).json();

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.removeItem(E2E_MSW_STORAGE_KEY);
});
afterEach(() => {
  delete target.__KAITEN_MSW_RUNNING__;
  delete target.__KAITEN_MSW_UPDATE__;
  window.sessionStorage.removeItem(E2E_MSW_STORAGE_KEY);
});

describe('updating the running E2E mock API', () => {
  it('rebuilds a billing slot in the same page while preserving other stored slots', async () => {
    const full = billingCapabilitiesProfiles.full();
    const model = new BillingAppModel({
      capabilities: { ...full, features: { ...full.features, addons: false }, featureCheckUnavailable: ['addons'] },
    });
    await startE2EMockServiceWorker({ billing: model.serializeForMsw(), flagEvaluations: { 'demo-sandbox': true } });
    server.use(...setupWorker.mock.calls[0]);
    expect(await capabilities()).toMatchObject({ features: { addons: false }, featureCheckUnavailable: ['addons'] });

    model.setCapabilities(full);
    await updateBillingAppMocks(page, model);

    expect(setupWorker).toHaveBeenCalledTimes(1);
    expect(resetHandlers).toHaveBeenCalledTimes(1);
    server.use(...resetHandlers.mock.calls[0]);
    expect(await capabilities()).toEqual(full);
    const config = JSON.parse(window.sessionStorage.getItem(E2E_MSW_STORAGE_KEY)!) as E2EMswConfig;
    expect(config.flagEvaluations).toEqual({ 'demo-sandbox': true });
    expect(config.billing?.capabilities).toEqual(full);
  });

  it('fails loudly when the page has no running mock API', async () => {
    await expect(updateBillingAppMocks(page, new BillingAppModel())).rejects.toThrow('The page has no running E2E mock API to update');
  });
});
