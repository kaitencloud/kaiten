import type { FeatureFlag } from '@/api-client';
import { TEST_USER } from '../../../../e2e/app/_support/fixtures';
import type { FeatureFlagAppModelSeed } from '../../../../e2e/app/_support/model/feature-flag-app-model';
import { daysAgo, minutesAgo } from './dates';

export type FeatureFlagRecord = NonNullable<
  FeatureFlagAppModelSeed['featureFlags']
>[number];

const buildFeatureFlag = ({
  createdAt,
  updatedAt = createdAt,
  ...flag
}: Omit<FeatureFlag, 'id'> & {
  createdAt: string;
  slug: string;
  updatedAt?: string;
}): FeatureFlagRecord => ({
  ...flag,
  createdAt,
  createdBy: TEST_USER,
  id: `feature-flag-${flag.slug}`,
  updatedAt,
  updatedBy: TEST_USER,
});

const onOff = [
  { description: 'Turned off', name: 'off', value: false },
  { description: 'Turned on', name: 'on', value: true },
];

/** New checkout was last changed minutes ago: the audit trail records it. */
export const createFeatureFlags = (): FeatureFlagRecord[] => [
  buildFeatureFlag({
    createdAt: daysAgo(90),
    default_variant: { type: 'basic', value: 'control' },
    description: 'Opens the revamped dashboard to beta testers',
    enabled: true,
    event_name: 'beta_access_evaluated',
    metadata: { owner: 'Growth Team' },
    name: 'Beta Access',
    slug: 'beta-access',
    targetings: [
      {
        name: 'Enterprise customers',
        rule: 'context.license == "enterprise"',
        type: 'basic',
        variant: 'beta',
      },
    ],
    type: 'string',
    updatedAt: daysAgo(10),
    variants: [
      { description: 'Existing experience', name: 'control', value: 'control' },
      { description: 'Beta experience', name: 'beta', value: 'beta' },
    ],
  }),
  buildFeatureFlag({
    createdAt: daysAgo(60),
    default_variant: { type: 'basic', value: 'off' },
    description: 'Gradually introduces a redesigned homepage',
    enabled: false,
    event_name: 'homepage_redesign_evaluated',
    metadata: { owner: 'Platform Team' },
    name: 'Homepage Redesign',
    slug: 'homepage-redesign',
    targetings: [
      {
        distribution: { off: 50, on: 50 },
        name: 'EU experiment',
        rule: 'context.region == "eu"',
        type: 'rollout_percentage',
      },
    ],
    type: 'boolean',
    variants: onOff,
  }),
  buildFeatureFlag({
    createdAt: daysAgo(30),
    default_variant: { type: 'basic', value: 'off' },
    description: 'Routes shoppers to the new checkout',
    enabled: true,
    event_name: 'new_checkout_evaluated',
    metadata: {},
    name: 'New Checkout',
    slug: 'new-checkout',
    targetings: [
      {
        name: 'Globex pilot',
        rule: 'context.customer == "globex"',
        type: 'basic',
        variant: 'on',
      },
    ],
    type: 'boolean',
    updatedAt: minutesAgo(25),
    variants: onOff,
  }),
];
