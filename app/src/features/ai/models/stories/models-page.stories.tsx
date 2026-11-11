import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  AI_ACCESS_FRESHNESS_MS,
  aiAccessQueryOptions,
  aiRateCardQueryKey,
  modelsQueryOptions,
} from '@/domains/ai-credits';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import {
  storyLicenses,
  storyModels,
} from '../../pricing/stories/rate-card-story-fixtures';
import { ModelsPage } from '../models-page';

/**
 * The model list over the catalogue of the mocks: each model with its vendor
 * cost and the rules that name it, read from the rate card. The caches are
 * filled for the story; nothing is requested.
 */
const seed = (scopes: readonly string[] | null) => (client: QueryClient) => {
  client.setQueryData(aiAccessQueryOptions().queryKey, {
    enabled: true,
    expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS * 1000,
  });
  client.setQueryData(grantedScopesQueryKey, scopes);
  client.setQueryData(modelsQueryOptions.queryKey, {
    hasMore: false,
    items: storyModels,
  });
  // The rules are read only by a session that may read licences and rules.
  if (scopes === null) {
    client.setQueryData(aiRateCardQueryKey, storyLicenses);
  }
};

const meta = {
  title: 'Features/AI/Models/ModelsPage',
  component: ModelsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ModelsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Vendor cost per million tokens or per unit, and the rules that name each model. */
export const Catalogue: Story = {
  render: () => (
    <StorybookRouter seed={seed(null)}>
      <ModelsPage />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const table = within(await within(canvasElement).findByRole('table'));
    await expect(table.getByText('$3 in · $15 out / 1M tokens')).toBeVisible();
    await expect(
      table.getByRole('button', { name: /Open the rate card on Claude Sonnet 4\.5/ }),
    ).toHaveTextContent('6 rules');
    await expect(table.getAllByText('No rule').length).toBeGreaterThan(0);
  },
};

/** Delete on a model that rules name: it cannot be deleted, and archiving is offered. */
export const DeleteOffersArchive: Story = {
  render: Catalogue.render,
  play: async ({ canvasElement }) => {
    const table = within(await within(canvasElement).findByRole('table'));
    await userEvent.click(table.getByRole('button', { name: 'Delete Claude Sonnet 4.5' }));
    const dialog = await within(document.body).findByRole('alertdialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(dialog).toHaveTextContent('Claude Sonnet 4.5 cannot be deleted');
    await expect(within(dialog).getByRole('button', { name: 'Archive model' })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(within(document.body).queryByRole('alertdialog')).toBeNull(),
    );
  },
};

/** A session that may read models only: no rule count, and nothing to write. */
export const ReadOnlyWithoutRules: Story = {
  render: () => (
    <StorybookRouter seed={seed(['read:models'])}>
      <ModelsPage />
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const table = within(await within(canvasElement).findByRole('table'));
    await expect(table.queryByRole('button', { name: /Open the rate card/ })).toBeNull();
    await expect(table.getByRole('button', { name: 'Delete Claude Sonnet 4.5' })).toBeDisabled();
  },
};
