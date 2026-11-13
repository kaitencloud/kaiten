import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vite-plus/test';
import type { RequestHandler } from 'msw';
import { server } from '@/__tests__/msw-server';
import { renderWithClient, useBillingTexts } from '@/test-fixtures/billing-test-support';
import meta, {
  Default, CustomerWithABillingEmail, WithATrial, WithoutTrials, PriceBilledInArrears,
} from '../subscribe-instance.stories';

// Exercise the maintained story renders/assertions in jsdom, not a browser runner.
vi.mock('storybook/test', () => ({ expect, screen, fn: vi.fn }));
useBillingTexts();

it.each([
  ['Default', Default],
  ['Customer with billing email', CustomerWithABillingEmail],
  ['With a trial', WithATrial],
  ['Without trials', WithoutTrials],
  ['Price billed in arrears', PriceBilledInArrears],
] as const)('renders the %s story with its real instance provider and declared fixtures', async (_name, story) => {
  const specific = story.parameters as { msw?: { handlers: RequestHandler[] } } | undefined;
  server.use(...(specific?.msw?.handlers ?? meta.parameters.msw.handlers));
  renderWithClient(story.render!({} as never, {} as never));
  await story.play!({} as never);
});
