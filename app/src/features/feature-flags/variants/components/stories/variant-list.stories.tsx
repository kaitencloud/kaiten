import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import type { Variant, VariantListProps } from '../../types';
import { VariantList } from '../variant-list';

const VariantListWithState = (args: VariantListProps) => {
  const [variants, setVariants] = useState(args.variants);

  useEffect(() => {
    setVariants(args.variants);
  }, [args.type, args.variants]);

  return (
    <VariantList
      {...args}
      variants={variants}
      onChange={(nextVariants) => {
        setVariants(nextVariants);
        args.onChange(nextVariants);
      }}
    />
  );
};

const meta = {
  title: 'Functionals/Variants/VariantList',
  component: VariantList,
  render: (args) => <VariantListWithState {...args} />,
  decorators: [
    (Story: FC) => (
      <div className="max-w-3xl mx-auto p-6">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'VariantList manages a collection of feature flag variants with support for different value types (boolean, string, number, object). It provides live editing, validation, and auto-save functionality.',
      },
    },
  },
  args: {
    onChange: () => {}, // Default empty function, will be overridden by action in Controls
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['boolean', 'string', 'number', 'object'],
      description: 'The data type for variant values',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables all interactions',
    },
    onChange: {
      action: 'variants-changed',
      description: 'Callback when variants are modified',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof VariantList>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data
const booleanVariants: Variant[] = [
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
];

const stringVariants: Variant[] = [
  {
    name: 'variant_1',
    description: 'First string variant',
    value: 'option-a',
  },
  {
    name: 'variant_2',
    description: 'Second string variant',
    value: 'option-b',
  },
  {
    name: 'variant_3',
    description: 'Third string variant',
    value: 'option-c',
  },
];

const numberVariants: Variant[] = [
  {
    name: 'low',
    description: 'Low priority',
    value: 1,
  },
  {
    name: 'medium',
    description: 'Medium priority',
    value: 5,
  },
  {
    name: 'high',
    description: 'High priority',
    value: 10,
  },
];

const objectVariants: Variant[] = [
  {
    name: 'config_a',
    description: 'Configuration A',
    value: {
      theme: 'dark',
      fontSize: 14,
      features: ['feature1', 'feature2'],
    },
  },
  {
    name: 'config_b',
    description: 'Configuration B',
    value: {
      theme: 'light',
      fontSize: 16,
      features: ['feature3'],
    },
  },
];

const invalidVariants: Variant[] = [
  {
    name: 'valid',
    description: 'This one is valid',
    value: 'correct',
  },
  {
    name: '', // Invalid: no name
    description: 'Missing name',
    value: 'test',
  },
  {
    name: 'missing_value',
    description: 'No value',
    value: '', // Invalid for non-empty string requirement
  },
];

const duplicateVariants: Variant[] = [
  {
    name: 'duplicate',
    description: 'First one',
    value: 'value1',
  },
  {
    name: 'duplicate', // Invalid: duplicate name
    description: 'Second one with same name',
    value: 'value2',
  },
  {
    name: 'unique',
    description: 'This one is unique',
    value: 'value3',
  },
];

// Stories
export const Empty: Story = {
  args: {
    variants: [],
    type: 'boolean',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Empty state with no variants. Shows a helpful empty state message and an "Add First Variant" button.',
      },
    },
  },
};

export const SingleVariant: Story = {
  args: {
    variants: [booleanVariants[0]],
    type: 'boolean',
  },
  parameters: {
    docs: {
      description: {
        story:
          'A single boolean variant. The accordion is automatically expanded to show the form.',
      },
    },
  },
};

export const BooleanVariants: Story = {
  args: {
    variants: booleanVariants,
    type: 'boolean',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Classic boolean feature flag with "on" and "off" variants. Each variant shows a toggle input for its boolean value.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('heading', { name: 'Variants' }),
    ).toBeVisible();
    await expect(canvas.getByText('on', { exact: true })).toBeVisible();
    await expect(canvas.getByText('off', { exact: true })).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Add Variant' }),
    ).toBeNull();
  },
};

export const StringVariants: Story = {
  args: {
    variants: stringVariants,
    type: 'string',
  },
  parameters: {
    docs: {
      description: {
        story:
          'String-based variants for multi-option feature flags. Useful for A/B/C testing or configuration strings.',
      },
    },
  },
};

export const NumberVariants: Story = {
  args: {
    variants: numberVariants,
    type: 'number',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Numeric variants for priority levels, percentages, or other numerical configurations.',
      },
    },
  },
};

export const ObjectVariants: Story = {
  args: {
    variants: objectVariants,
    type: 'object',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Complex JSON object variants for rich configuration. Uses CodeMirror for syntax highlighting and validation.',
      },
    },
  },
};

export const WithValidationErrors: Story = {
  args: {
    variants: invalidVariants,
    type: 'string',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Variants with validation errors. Invalid variants are highlighted with red indicators in the accordion header.',
      },
    },
  },
};

export const WithDuplicateNames: Story = {
  args: {
    variants: duplicateVariants,
    type: 'string',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Variants with duplicate names. A warning message appears at the top indicating duplicate names must be resolved.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText(/Duplicate variant names detected!/),
    ).toBeVisible();
  },
};

export const ManyVariants: Story = {
  args: {
    variants: [...booleanVariants, ...stringVariants, ...numberVariants].map(
      (v, i) => ({
        ...v,
        name: `variant_${i + 1}`,
        description: `Variant number ${i + 1}`,
        value: v.value,
      }),
    ),
    type: 'string',
  },
  parameters: {
    docs: {
      description: {
        story:
          'A large list of variants to test scrolling and performance. All accordions are expanded by default.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    variants: stringVariants,
    type: 'string',
    disabled: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Disabled state prevents all interactions. The "Add Variant" button is disabled.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('button', { name: 'Add Variant' }),
    ).toBeDisabled();
  },
};

export const InteractiveAddVariant: Story = {
  args: {
    variants: stringVariants,
    type: 'string',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: clicking "Add Variant" appends a new variant row and exposes its Delete action. Serves as a behavioural baseline the Vitest runner executes on every CI run.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByTitle('Delete')).toHaveLength(3);

    const addButton = canvas.getByRole('button', { name: /add variant/i });
    await userEvent.click(addButton);

    await expect(canvas.getAllByTitle('Delete')).toHaveLength(4);
  },
};

export const InteractiveRemoveVariant: Story = {
  args: {
    variants: stringVariants,
    type: 'string',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: opening the confirmation dialog and confirming removes the targeted variant row.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await expect(canvas.getAllByTitle('Delete')).toHaveLength(3);

    await userEvent.click(canvas.getAllByTitle('Delete')[0]);

    const dialog = await body.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: /delete/i });
    await userEvent.click(confirm);

    await expect(canvas.getAllByTitle('Delete')).toHaveLength(2);
  },
};
