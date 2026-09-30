import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import i18n from '@/lib/i18n/config';
import { FeatureFlagStatsCards } from '../feature-flag-stats-cards';

// --- Mock Data ---

const makeFlag = (overrides: Partial<FeatureFlag> = {}): FeatureFlag => ({
  id: 'flag-1',
  name: 'test-flag',
  description: null,
  enabled: true,
  type: 'boolean',
  slug: 'test-flag',
  event_name: '',
  metadata: {},
  variants: null,
  targetings: null,
  default_variant: { type: 'basic', value: 'false' },
  ...overrides,
});

const mockFlags: FeatureFlag[] = [
  makeFlag({
    id: 'flag-1',
    name: 'new-checkout-flow',
    enabled: true,
    targetings: [
      {
        type: 'basic',
        name: 'beta-users',
        rule: 'user.beta == true',
        variant: 'true',
      },
    ],
  }),
  makeFlag({
    id: 'flag-2',
    name: 'ai-recommendations',
    enabled: false,
  }),
  makeFlag({
    id: 'flag-3',
    name: 'dark-mode',
    enabled: true,
    targetings: [
      {
        type: 'basic',
        name: 'all-users',
        rule: 'user.active == true',
        variant: 'true',
      },
    ],
  }),
  makeFlag({
    id: 'flag-4',
    name: 'experimental-search',
    enabled: true,
  }),
  makeFlag({
    id: 'flag-5',
    name: 'legacy-api',
    enabled: false,
  }),
];

// --- Meta ---

const meta = {
  title: 'Features/FeatureFlags/StatsCards',
  component: FeatureFlagStatsCards,
  decorators: [
    (Story: FC) => (
      <I18nextProvider i18n={i18n}>
        <div style={{ padding: 24, maxWidth: 1200 }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FeatureFlagStatsCards>;

export default meta;
type Story = StoryObj<typeof FeatureFlagStatsCards>;

// --- Stories ---

export const Default: Story = {
  args: {
    featureFlags: mockFlags,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Stats cards with a mix of enabled/disabled flags, some with targeting rules.',
      },
    },
  },
};

export const Empty: Story = {
  args: {
    featureFlags: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Stats cards when no feature flags exist (all zeros).',
      },
    },
  },
};

export const AllEnabled: Story = {
  args: {
    featureFlags: mockFlags.map((f) => ({ ...f, enabled: true })),
  },
  parameters: {
    docs: {
      description: {
        story: 'Stats cards when all flags are enabled.',
      },
    },
  },
};
