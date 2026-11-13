import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vite-plus/test';
import type { RequestHandler } from 'msw';
import { server } from '@/__tests__/msw-server';
import { renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import {
  WizardBoostOffer, WizardBoostOfferWithoutAi, DetailOfABoost,
} from '../voucher-screens.stories';

// Preserve the Storybook assertions; only the interaction environment is jsdom.
vi.mock('storybook/test', () => ({ expect, screen, userEvent, waitFor }));
useBillingTexts();

it.each([
  ['AI boost choices require both inputs', WizardBoostOffer],
  ['Ordinary boost choices survive a disabled platform flag', WizardBoostOfferWithoutAi],
  ['Ordinary Tokens summary waits for original types', DetailOfABoost],
] as const)('%s', async (_name, story) => {
  const parameters = story.parameters as { msw: { handlers: RequestHandler[] } };
  server.use(...parameters.msw.handlers);
  renderWithClient(story.render!({} as never, {} as never));
  await story.play!({} as never);
});
