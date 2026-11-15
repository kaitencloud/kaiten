import { expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers } from '@/e2e/msw/handlers';
import {
  createOpenRouterImportDraft,
  fetchOpenRouterCatalogue,
} from '../openrouter-catalogue';

// The import reads a third party from the browser: the mock API must answer in
// its place, with a catalogue the console's own parser accepts.
it('reads the synthetic catalogue of the mock API, never the real one', async () => {
  server.use(...createMockHandlers(createDevMockConfig()));

  const entries = await fetchOpenRouterCatalogue();

  expect(entries.length).toBeGreaterThan(3);
  expect(entries.every(({ id }) => !id.includes('openrouter'))).toBe(true);
  const fixed = entries.filter((entry) => entry.pricingStatus === 'fixed');
  expect(new Set(fixed.map((entry) => entry.modality))).toEqual(
    new Set(['TEXT', 'IMAGE', 'EMBEDDING']),
  );
  const router = entries.find(({ id }) => id === 'synthetic/router-auto');
  expect(router?.pricingStatus).toBe('reviewRequired');
  expect(router?.issues).toContain('dynamicPricing');
  expect(createOpenRouterImportDraft(fixed[0])).toMatchObject({
    externalIds: ['synthetic/atlas-large'],
    slug: 'synthetic-atlas-large',
    vendorCosts: { currency: 'USD', perInputToken: '0.000004' },
  });
});
