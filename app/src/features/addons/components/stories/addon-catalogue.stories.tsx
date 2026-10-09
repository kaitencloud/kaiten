import type { Meta, StoryObj } from '@storybook/react-vite';
import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import { expect, within } from 'storybook/test';
import type { Addon, AddonFamily } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListAddonFamilies,
} from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  buildAddon,
} from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { AddonsPageContent } from '../pages';

const meta = {
  title: 'Features/Addons/Catalogue',
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const SEATS_V1 = buildAddon({
  familySlug: 'extra-seats',
  isDefault: true,
  maxQuantity: 10,
  name: 'Extra seats',
  slug: 'extra-seats',
  versionName: '2026',
});
const SEATS_V2 = buildAddon({
  familySlug: 'extra-seats',
  lifecycleState: 'DRAFT',
  name: 'Extra seats',
  slug: 'extra-seats-v2',
  version: 2,
  versionName: '2027',
});
const STORAGE_V1 = buildAddon({
  familySlug: 'extra-storage',
  lifecycleState: 'ARCHIVED',
  name: 'Extra storage',
  slug: 'extra-storage',
  versionName: '2025',
});

const family = (slug: string, versions: Addon[], isPublic = false): AddonFamily => ({
  currentVersion: versions.find((version) => version.isDefault),
  id: `addon-family-${slug}`,
  isPublic,
  lastVersion: Math.max(...versions.map(({ version }) => version)),
  slug,
  versions: [...versions].sort((left, right) => right.version - left.version),
});

// The catalogue: every family with its versions, the one a family resolves to, the
// lifecycle of each version, and whether the family is listed in the public catalogue.
export const Catalogue: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
        handleListAddonFamilies(() =>
          HttpResponse.json([
            family('extra-seats', [SEATS_V1, SEATS_V2], true),
            family('extra-storage', [STORAGE_V1]),
          ]),
        ),
      ],
    },
  },
  render: () => (
    <StorybookRouter initialEntries={['/addons']}>
      <Suspense fallback={null}>
        <AddonsPageContent />
      </Suspense>
    </StorybookRouter>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Extra seats')).toBeVisible();
    await expect(canvas.getByText('Extra storage')).toBeVisible();
    await expect(canvas.getByText('Public')).toBeVisible();
  },
};
