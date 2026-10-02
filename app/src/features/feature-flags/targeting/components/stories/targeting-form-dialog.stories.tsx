import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { FC } from 'react';
import { useState } from 'react';
import type { Variant } from '@/api-client';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import type { Targeting } from '../../types';
import { TargetingFormDialog } from '../targeting-form-dialog';
import { targetingContextHandler } from './targeting-context-handler';

// Wrapper component to control dialog state
function DialogWrapper({
  targeting,
  mode,
  variants,
}: {
  targeting?: Targeting;
  mode: 'create' | 'edit';
  variants: Variant[];
}) {
  const [result, setResult] = useState<Targeting | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {result && (
          <div className="text-sm text-muted-foreground">
            Last submission: {result.name} ({result.type})
          </div>
        )}
      </div>

      <TargetingFormDialog
        disableCelValidation
        open
        onOpenChange={() => {}}
        variants={variants}
        onSubmit={setResult}
        targeting={targeting}
        mode={mode}
      />

      {result && (
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Submitted Data:</h3>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

const meta = {
  title: 'Functionals/Targeting/TargetingFormDialog',
  component: TargetingFormDialog,
  decorators: [
    (Story: FC) => (
      <div
        style={{
          minHeight: '100vh',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    // The rule editor reads the targeting context.
    msw: { handlers: [targetingContextHandler] },
    viewport: {
      defaultViewport: 'responsive',
    },
    docs: {
      description: {
        component:
          'TargetingFormDialog provides a unified interface for creating and editing targeting rules with three different types: Basic (simple CEL rule), Rollout Date (progressive rollout over time), and Rollout Percentage (A/B testing with distribution).',
      },
      story: {
        inline: false,
        iframeHeight: '100vh',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TargetingFormDialog>;

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
const mockBasicTargeting: Targeting = {
  type: 'basic',
  name: 'Enterprise Customers',
  rule: "__kaiten.deploymentZone.type == 'production' && __kaiten.license.slug == 'scale'",
  variant: 'on',
};

const mockRolloutDateTargeting: Targeting = {
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

const mockRolloutPercentageTargeting: Targeting = {
  type: 'rollout_percentage',
  name: 'Premium A/B Test',
  rule: "__kaiten.license.slug == 'premium'",
  distribution: {
    on: 50,
    off: 30,
    canary: 20,
  },
};

// Stories
export const CreateBasic: StoryObj<typeof TargetingFormDialog> = {
  render: () => <DialogWrapper mode="create" variants={mockVariants} />,
  parameters: {
    docs: {
      description: {
        story:
          'Create a new basic targeting rule. Basic targeting returns a single variant when the CEL expression evaluates to true. Perfect for simple conditions like region or license checks.',
      },
    },
  },
  play: async () => {
    // Dialog renders in a portal under document.body.
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);

    await expect(
      await findVisibleByRole(dialog, 'heading', {
        name: 'Create Targeting Rule',
      }),
    ).toBeVisible();
    await expect(
      await dialogScope.findByRole('combobox', { name: /Targeting Type/i }),
    ).toBeVisible();
    await expect(
      dialogScope.getByRole('button', { name: 'Save' }),
    ).toBeDisabled();
  },
};

/**
 * Type-switch smoke: changing the targeting type swaps the displayed fields
 * (rollout-percentage distribution / rollout-date start+end). Replaces the
 * deleted Playwright iframe spec.
 */
export const InteractiveTypeSwitch: StoryObj<typeof TargetingFormDialog> = {
  render: () => <DialogWrapper mode="create" variants={mockVariants} />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: switching targeting types updates the visible field group.',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);
    const typeSelect = await findVisibleByRole(dialog, 'combobox', {
      name: /Targeting Type/i,
    });

    await userEvent.click(typeSelect);
    await userEvent.click(
      await findVisibleByRole(document.body, 'option', {
        name: 'Rollout Percentage',
      }),
    );
    await expect(
      await findVisibleByRole(dialog, 'heading', {
        name: /Percentage Distribution/,
      }),
    ).toBeVisible();
    await expect(
      dialogScope.getByText(/No variants in distribution/),
    ).toBeVisible();

    await userEvent.click(typeSelect);
    await userEvent.click(
      await findVisibleByRole(document.body, 'option', {
        name: 'Rollout Date',
      }),
    );
    await expect(
      await dialogScope.findByText('Start Configuration', { exact: true }),
    ).toBeVisible();
    await expect(
      dialogScope.getByText('End Configuration', { exact: true }),
    ).toBeVisible();
  },
};

export const CreateRolloutDate: StoryObj<typeof TargetingFormDialog> = {
  render: () => <DialogWrapper mode="create" variants={mockVariants} />,
  parameters: {
    docs: {
      description: {
        story:
          'Create a date-based rollout targeting rule. Use this for progressive rollouts where you want to gradually increase the percentage of users over time (e.g., 0% on Jan 1st, 100% on Jan 31st).',
      },
    },
  },
};

export const CreateRolloutPercentage: StoryObj<typeof TargetingFormDialog> = {
  render: () => <DialogWrapper mode="create" variants={mockVariants} />,
  parameters: {
    docs: {
      description: {
        story:
          'Create a percentage-based rollout targeting rule. Perfect for A/B testing where you want to split traffic between variants (e.g., 50% on, 30% off, 20% canary). The total must equal 100%.',
      },
    },
  },
};

export const EditBasicTargeting: StoryObj<typeof TargetingFormDialog> = {
  render: () => (
    <DialogWrapper
      mode="edit"
      variants={mockVariants}
      targeting={mockBasicTargeting}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Edit an existing basic targeting rule. In edit mode, the type selector is hidden and the form is pre-filled with the existing values.',
      },
    },
  },
  play: async () => {
    const dialog = await findVisibleByRole(document.body, 'dialog');
    const dialogScope = within(dialog);

    await expect(
      await findVisibleByRole(dialog, 'heading', {
        name: 'Edit Targeting Rule',
      }),
    ).toBeVisible();
    await expect(
      dialogScope.queryByRole('combobox', { name: /Targeting Type/i }),
    ).toBeNull();
    // The required mark sits beside the label, hidden from assistive
    // technology: the field is named "Name" and carries aria-required.
    const nameField = await dialogScope.findByRole('textbox', { name: 'Name' });
    await expect(nameField).toHaveValue('Enterprise Customers');
    await expect(nameField).toBeRequired();
  },
};

export const EditRolloutDateTargeting: StoryObj<typeof TargetingFormDialog> = {
  render: () => (
    <DialogWrapper
      mode="edit"
      variants={mockVariants}
      targeting={mockRolloutDateTargeting}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Edit an existing date-based rollout rule. The date pickers and percentage sliders are pre-filled with the existing configuration.',
      },
    },
  },
};

export const EditRolloutPercentageTargeting: StoryObj<
  typeof TargetingFormDialog
> = {
  render: () => (
    <DialogWrapper
      mode="edit"
      variants={mockVariants}
      targeting={mockRolloutPercentageTargeting}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Edit an existing percentage-based rollout rule. The distribution list is pre-filled with the existing variant percentages.',
      },
    },
  },
};

export const EditRolloutPercentageTwoVariants: StoryObj<
  typeof TargetingFormDialog
> = {
  render: () => {
    const twoVariants: Variant[] = [
      { name: 'on', description: 'Feature enabled', value: true },
      { name: 'off', description: 'Feature disabled', value: false },
    ];
    const targeting: Targeting = {
      type: 'rollout_percentage',
      name: 'Simple A/B Test',
      rule: "__kaiten.license.slug == 'premium'",
      distribution: { on: 70, off: 30 },
    };

    return (
      <DialogWrapper mode="edit" variants={twoVariants} targeting={targeting} />
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Editing a percentage-based rollout with exactly 2 variants. Uses a single linked slider where moving one variant automatically adjusts the other to always sum to 100%.',
      },
    },
  },
};

export const WithManyVariants: StoryObj<typeof TargetingFormDialog> = {
  render: () => {
    const manyVariants: Variant[] = Array.from({ length: 10 }, (_, i) => ({
      name: `variant_${i + 1}`,
      description: `Variant ${i + 1}`,
      value: `value_${i + 1}`,
    }));

    return <DialogWrapper mode="create" variants={manyVariants} />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Dialog with many available variants. Tests the ScrollArea functionality and ensures the form is usable with large variant lists.',
      },
    },
  },
};

export const WithComplexCELExpression: StoryObj<typeof TargetingFormDialog> = {
  render: () => {
    const complexTargeting: Targeting = {
      type: 'basic',
      name: 'Complex Multi-Condition Rule',
      rule: `(__kaiten.deploymentZone.type == 'production' || __kaiten.deploymentZone.type == 'staging') &&
__kaiten.license.slug in ['scale', 'premium'] &&
__kaiten.entitlements['seats'].remaining > 0 &&
!(user.cohort == 'beta-excluded')`,
      variant: 'on',
    };

    return (
      <DialogWrapper
        mode="edit"
        variants={mockVariants}
        targeting={complexTargeting}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Editing a targeting rule with a complex multi-line CEL expression. The textarea auto-grows to accommodate long expressions.',
      },
    },
  },
};

export const WithInvalidCEL: StoryObj<typeof TargetingFormDialog> = {
  render: () => {
    const invalidTargeting: Targeting = {
      type: 'basic',
      name: 'Invalid CEL Rule',
      rule: "__kaiten.deploymentZone.type == 'production' && __kaiten.license.slug ===", // Invalid CEL
      variant: 'on',
    };

    return (
      <DialogWrapper
        mode="edit"
        variants={mockVariants}
        targeting={invalidTargeting}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Editing a targeting rule with an invalid CEL expression. The form should show validation errors and prevent submission until the CEL is valid.',
      },
    },
  },
};

export const Interactive: StoryObj<typeof TargetingFormDialog> = {
  render: () => <DialogWrapper mode="create" variants={mockVariants} />,
  parameters: {
    docs: {
      description: {
        story:
          'Fully interactive story for testing. Try:\n- Switching between targeting types\n- Filling in the CEL expression\n- Selecting variants\n- Submitting the form\n- Cancelling the dialog',
      },
    },
  },
};
