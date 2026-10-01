import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { FC } from 'react';
import type { Variant } from '@/api-client';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import type { Targeting } from '../../types';
import { TargetingList } from '../targeting-list';
import { SeedTargetingContext } from './seed-targeting-context';

const meta = {
  title: 'Functionals/Targeting/TargetingList',
  component: TargetingList,
  args: {
    disableCelValidation: true,
  },
  decorators: [
    // Add Rule and Edit open the rule editor, which reads the targeting context.
    (Story: FC) => (
      <SeedTargetingContext>
        <div className="max-w-4xl mx-auto p-6">
          <Story />
        </div>
      </SeedTargetingContext>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'TargetingList manages a collection of targeting rules for feature flags. Rules are evaluated in order, so the order matters! Use the up/down arrows to reorder rules. Supports three targeting types: Basic (simple CEL rule), Rollout Date (progressive rollout), and Rollout Percentage (A/B testing).',
      },
    },
  },
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'Disables all interactions',
    },
    onChange: {
      action: 'targetings-changed',
      description: 'Callback when targetings are modified',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TargetingList>;

export default meta;

// Mock variants
const mockVariants: Variant[] = [
  {
    name: 'on',
    description: 'Feature enabled',
    value: true,
  },
  {
    name: 'off',
    description: 'Feature disabled',
    value: false,
  },
  {
    name: 'canary',
    description: 'Canary release',
    value: true,
  },
];

// Mock targeting rules
const basicTargeting: Targeting = {
  type: 'basic',
  name: 'Enterprise Customers',
  rule: "__kaiten.deploymentZone.type == 'production' && __kaiten.license.slug == 'scale'",
  variant: 'on',
};

const rolloutDateTargeting: Targeting = {
  type: 'rollout_date',
  name: 'EU Gradual Rollout',
  rule: "__kaiten.deploymentZone.type == 'production'",
  start: {
    date: '2025-01-01T00:00:00Z',
    percentage: 0,
    variant: 'on',
  },
  end: {
    date: '2025-01-31T23:59:59Z',
    percentage: 100,
    variant: 'on',
  },
};

const rolloutPercentageTargeting: Targeting = {
  type: 'rollout_percentage',
  name: 'Premium A/B Test',
  rule: "__kaiten.license.slug == 'premium'",
  distribution: {
    on: 50,
    off: 30,
    canary: 20,
  },
};

const multipleTargetings: Targeting[] = [
  basicTargeting,
  rolloutDateTargeting,
  rolloutPercentageTargeting,
  {
    type: 'basic',
    name: 'Beta Users',
    rule: "user.cohort == 'beta'",
    variant: 'on',
  },
  {
    type: 'basic',
    name: 'North America',
    rule: "__kaiten.deploymentZone.slug in ['us-east-1', 'us-west-2', 'ca-central-1']",
    variant: 'canary',
  },
];

// Stories
export const Empty: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [],
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Empty state with no targeting rules. Shows a helpful empty state message and an "Add First Rule" button.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('heading', { name: 'Targeting Rules' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Add First Rule' }),
    ).toBeVisible();
  },
};

export const NoVariantsWarning: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [],
    variants: [],
  },
  parameters: {
    docs: {
      description: {
        story:
          'When no variants are available, the targeting list shows a warning and disables the "Add Rule" button. Users must define variants first in Step 2.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText(
        'Please define variants in Step 2 before adding targeting rules.',
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Add Rule' }),
    ).toBeDisabled();
  },
};

export const SingleBasicRule: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [basicTargeting],
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A single basic targeting rule. Shows the rule name, type badge, and action buttons (edit, delete). No reorder arrows since there's only one rule.",
      },
    },
  },
};

export const SingleRolloutDateRule: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [rolloutDateTargeting],
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A single date-based rollout rule. The card displays the start/end dates and percentages in a readable format.',
      },
    },
  },
};

export const SingleRolloutPercentageRule: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [rolloutPercentageTargeting],
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A single percentage-based rollout rule. The card shows the distribution breakdown (e.g., "on: 50%, off: 30%, canary: 20%").',
      },
    },
  },
};

export const MultipleRules: StoryObj<typeof TargetingList> = {
  args: {
    targetings: multipleTargetings,
    variants: mockVariants,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Enterprise Customers')).toBeVisible();
    await expect(canvas.getByText('EU Gradual Rollout')).toBeVisible();
    await expect(canvas.getByText('Premium A/B Test')).toBeVisible();
    await expect(canvas.getByText('North America')).toBeVisible();
    await expect(canvas.getAllByText('Basic Targeting').length).toBe(3);
    await expect(canvas.getAllByText('Rollout Date').length).toBe(1);
    await expect(canvas.getAllByText('Rollout Percentage').length).toBe(1);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multiple targeting rules of different types. Each card shows its position number, type badge, and reorder arrows. Order matters - rules are evaluated top to bottom!',
      },
    },
  },
};

export const AllBasicRules: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [
      basicTargeting,
      {
        type: 'basic',
        name: 'Beta Users',
        rule: "user.cohort == 'beta'",
        variant: 'on',
      },
      {
        type: 'basic',
        name: 'North America',
        rule: "__kaiten.deploymentZone.slug in ['us-east-1', 'us-west-2']",
        variant: 'canary',
      },
      {
        type: 'basic',
        name: 'Free Tier',
        rule: "__kaiten.license.slug == 'free'",
        variant: 'off',
      },
    ],
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'List of only basic targeting rules. Useful for testing the ordering functionality with multiple rules of the same type.',
      },
    },
  },
};

export const MixedTypes: StoryObj<typeof TargetingList> = {
  args: {
    targetings: multipleTargetings,
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Mix of all three targeting types. Each type has a different colored badge (Basic: blue, Rollout Date: purple, Rollout Percentage: green).',
      },
    },
  },
};

export const ManyRules: StoryObj<typeof TargetingList> = {
  args: {
    targetings: Array.from({ length: 10 }, (_, i) => ({
      type: 'basic' as const,
      name: `Rule ${i + 1}`,
      rule: `__kaiten.instance.slug == 'instance-${i + 1}'`,
      variant: i % 2 === 0 ? 'on' : 'off',
    })),
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A large list of targeting rules to test scrolling and performance. All rules show their position number and reorder controls.',
      },
    },
  },
};

export const Disabled: StoryObj<typeof TargetingList> = {
  args: {
    targetings: multipleTargetings,
    variants: mockVariants,
    disabled: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Disabled state prevents all interactions. The "Add Rule" button is disabled, but existing rules are still visible.',
      },
    },
  },
};

export const TwoVariantPercentage: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [
      {
        type: 'rollout_percentage',
        name: 'Simple A/B Test',
        rule: "__kaiten.license.slug == 'premium'",
        distribution: {
          on: 70,
          off: 30,
        },
      },
    ],
    variants: [
      { name: 'on', description: 'Feature enabled', value: true },
      { name: 'off', description: 'Feature disabled', value: false },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'A percentage-based rollout with exactly 2 variants. Uses a single linked slider where adjusting one variant automatically updates the other to always sum to 100%.',
      },
    },
  },
};

export const WithComplexRules: StoryObj<typeof TargetingList> = {
  args: {
    targetings: [
      {
        type: 'basic',
        name: 'Complex Multi-Condition Rule',
        rule: `(__kaiten.deploymentZone.type == 'production' || __kaiten.deploymentZone.type == 'staging') &&
__kaiten.license.slug in ['scale', 'premium'] &&
__kaiten.entitlements['seats'].remaining > 0`,
        variant: 'on',
      },
      {
        type: 'rollout_date',
        name: 'Q1 2025 Launch',
        rule: "user.cohort == 'early-adopter'",
        start: {
          date: '2025-01-01T00:00:00Z',
          percentage: 10,
          variant: 'canary',
        },
        end: {
          date: '2025-03-31T23:59:59Z',
          percentage: 100,
          variant: 'on',
        },
      },
      {
        type: 'rollout_percentage',
        name: 'Multi-Variant A/B/C Test',
        rule: "__kaiten.license.slug == 'premium' || __kaiten.license.slug == 'scale'",
        distribution: {
          on: 40,
          off: 30,
          canary: 30,
        },
      },
    ],
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Targeting rules with complex CEL expressions and configurations. Tests how the UI handles long rule texts and complex conditions.',
      },
    },
  },
};

export const Interactive: StoryObj<typeof TargetingList> = {
  args: {
    targetings: multipleTargetings,
    variants: mockVariants,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Fully interactive story for testing. Try:\n- Adding new rules\n- Editing existing rules\n- Deleting rules\n- Reordering rules with up/down arrows\n- All changes are logged in the Actions panel',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const addRule = await canvas.findByRole('button', { name: 'Add Rule' });
    await userEvent.click(addRule);

    // Targeting create dialog renders in a portal under document.body.
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);
    await expect(
      await findVisibleByRole(dialog, 'heading', {
        name: 'Create Targeting Rule',
      }),
    ).toBeVisible();
    await expect(
      dialogScope.getByRole('button', { name: 'Save' }),
    ).toBeDisabled();
  },
};
