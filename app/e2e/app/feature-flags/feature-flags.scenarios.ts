import type {
  BasicTargeting,
  FeatureFlag,
  RolloutPercentageTargeting,
  User,
  Variant,
} from '@/api-client';
import { FeatureFlagAppModel } from '../_support/model/feature-flag-app-model';

type FeatureFlagRecord = FeatureFlag & {
  createdAt: string;
  createdBy: User;
  updatedAt: string;
  updatedBy: User;
};

const TEST_USER: User = {
  id: 'user-e2e',
  name: 'E2E Tester',
};

const buildVariant = ({
  description,
  name,
  value,
}: {
  description: string;
  name: string;
  value: unknown;
}): Variant => ({
  description,
  name,
  value,
});

const buildBasicTargeting = ({
  name,
  rule,
  variant,
}: {
  name: string;
  rule: string;
  variant: string;
}): BasicTargeting => ({
  name,
  rule,
  type: 'basic',
  variant,
});

const buildRolloutPercentageTargeting = ({
  distribution,
  name,
  rule,
}: {
  distribution: Record<string, number>;
  name: string;
  rule: string;
}): RolloutPercentageTargeting => ({
  distribution,
  name,
  rule,
  type: 'rollout_percentage',
});

const buildFeatureFlag = ({
  createdAt = '2026-03-01T09:00:00.000Z',
  defaultVariant,
  description,
  enabled = true,
  eventName = '',
  id,
  metadata = {},
  name,
  slug,
  targetings = [],
  type,
  updatedAt = createdAt,
  variants,
}: {
  createdAt?: string;
  defaultVariant: FeatureFlag['default_variant'];
  description: string | null;
  enabled?: boolean;
  eventName?: string;
  id: string;
  metadata?: Record<string, unknown>;
  name: string;
  slug: string;
  targetings?: FeatureFlag['targetings'];
  type: FeatureFlag['type'];
  updatedAt?: string;
  variants: Variant[];
}): FeatureFlagRecord => ({
  createdAt,
  createdBy: TEST_USER,
  default_variant: defaultVariant,
  description,
  enabled,
  event_name: eventName,
  id,
  metadata,
  name,
  slug,
  targetings,
  type,
  updatedAt,
  updatedBy: TEST_USER,
  variants,
});

export function createFeatureFlagsListModel() {
  return new FeatureFlagAppModel({
    featureFlags: [
      buildFeatureFlag({
        defaultVariant: {
          type: 'basic',
          value: 'control',
        },
        description: 'Controls beta access to the revamped dashboard',
        eventName: 'beta_access_evaluated',
        id: 'feature-flag-beta-access',
        metadata: {
          owner: 'Growth Team',
        },
        name: 'Beta Access',
        slug: 'beta-access',
        targetings: [
          buildBasicTargeting({
            name: 'Enterprise Customers',
            rule: 'context.plan == "enterprise"',
            variant: 'beta',
          }),
        ],
        type: 'string',
        variants: [
          buildVariant({
            description: 'Existing experience',
            name: 'control',
            value: 'control',
          }),
          buildVariant({
            description: 'Beta experience',
            name: 'beta',
            value: 'beta',
          }),
        ],
      }),
      buildFeatureFlag({
        defaultVariant: {
          type: 'basic',
          value: 'false',
        },
        description: 'Gradually introduces a redesigned homepage shell',
        enabled: false,
        eventName: 'homepage_redesign_evaluated',
        id: 'feature-flag-homepage-redesign',
        metadata: {
          owner: 'Platform Team',
        },
        name: 'Homepage Redesign',
        slug: 'homepage-redesign',
        targetings: [
          buildRolloutPercentageTargeting({
            distribution: {
              true: 50,
              false: 50,
            },
            name: 'EU experiment',
            rule: 'context.region == "eu"',
          }),
        ],
        type: 'boolean',
        variants: [
          buildVariant({
            description: 'Homepage redesign enabled',
            name: 'true',
            value: true,
          }),
          buildVariant({
            description: 'Homepage redesign disabled',
            name: 'false',
            value: false,
          }),
        ],
      }),
    ],
  });
}

export function createEmptyFeatureFlagsModel() {
  return new FeatureFlagAppModel();
}

export function createEditableFeatureFlagModel() {
  return new FeatureFlagAppModel({
    featureFlags: [
      buildFeatureFlag({
        defaultVariant: {
          type: 'basic',
          value: 'control',
        },
        description: 'Controls the checkout experiment experience',
        eventName: 'checkout_experiment_evaluated',
        id: 'feature-flag-checkout-experiment',
        metadata: {
          owner: 'Checkout Team',
        },
        name: 'Checkout Experiment',
        slug: 'checkout-experiment',
        type: 'string',
        variants: [
          buildVariant({
            description: 'Current checkout experience',
            name: 'control',
            value: 'control',
          }),
          buildVariant({
            description: 'Experimental express checkout',
            name: 'express',
            value: 'express',
          }),
        ],
      }),
    ],
  });
}

export function createNumberFeatureFlagModel() {
  return new FeatureFlagAppModel({
    featureFlags: [
      buildFeatureFlag({
        defaultVariant: {
          type: 'basic',
          value: 'basic',
        },
        description: 'Maximum file upload size in megabytes',
        eventName: 'max_upload_size_evaluated',
        id: 'feature-flag-max-upload-size',
        metadata: {
          owner: 'Platform Team',
          unit: 'megabytes',
        },
        name: 'Max Upload Size',
        slug: 'max-upload-size',
        targetings: [
          buildBasicTargeting({
            name: 'Pro Users',
            rule: 'context.plan == "pro"',
            variant: 'pro',
          }),
          buildBasicTargeting({
            name: 'Enterprise Users',
            rule: 'context.plan == "enterprise"',
            variant: 'enterprise',
          }),
        ],
        type: 'number',
        variants: [
          buildVariant({
            description: 'Basic tier limit',
            name: 'basic',
            value: 10,
          }),
          buildVariant({
            description: 'Pro tier limit',
            name: 'pro',
            value: 100,
          }),
          buildVariant({
            description: 'Enterprise tier limit',
            name: 'enterprise',
            value: 1000,
          }),
        ],
      }),
    ],
  });
}

export function createObjectFeatureFlagModel() {
  return new FeatureFlagAppModel({
    featureFlags: [
      buildFeatureFlag({
        defaultVariant: {
          type: 'basic',
          value: 'production',
        },
        description: 'API endpoint and timeout settings',
        eventName: 'api_config_evaluated',
        id: 'feature-flag-api-config',
        metadata: {
          owner: 'Developer Platform',
          domain: 'api',
        },
        name: 'API Configuration',
        slug: 'api-config',
        targetings: [
          buildBasicTargeting({
            name: 'Internal QA',
            rule: 'context.environment == "staging"',
            variant: 'staging',
          }),
        ],
        type: 'object',
        variants: [
          buildVariant({
            description: 'Production environment settings',
            name: 'production',
            value: {
              endpoint: 'https://api.example.com',
              retries: 3,
              timeout: 5000,
            },
          }),
          buildVariant({
            description: 'Staging environment settings',
            name: 'staging',
            value: {
              debug: true,
              endpoint: 'https://staging-api.example.com',
              retries: 5,
              timeout: 10000,
            },
          }),
        ],
      }),
    ],
  });
}

export function createEvaluableFeatureFlagModel() {
  return new FeatureFlagAppModel({
    featureFlags: [
      buildFeatureFlag({
        defaultVariant: {
          type: 'basic',
          value: 'control',
        },
        description: 'Evaluates which pricing layout should be returned',
        eventName: 'pricing_layout_evaluated',
        id: 'feature-flag-pricing-layout',
        metadata: {
          owner: 'Monetization Team',
        },
        name: 'Pricing Layout',
        slug: 'pricing-layout',
        targetings: [
          buildBasicTargeting({
            name: 'Enterprise Pricing',
            rule: 'context.plan == "enterprise"',
            variant: 'premium',
          }),
        ],
        type: 'string',
        variants: [
          buildVariant({
            description: 'Current pricing layout',
            name: 'control',
            value: 'control',
          }),
          buildVariant({
            description: 'Premium pricing layout',
            name: 'premium',
            value: 'premium',
          }),
        ],
      }),
    ],
  });
}
