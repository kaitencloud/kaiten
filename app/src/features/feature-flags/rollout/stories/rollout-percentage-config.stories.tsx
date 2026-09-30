import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Variant } from '@/api-client';
import { RolloutPercentageConfig } from '..';

const meta: Meta<typeof RolloutPercentageConfig> = {
  title: 'Functionals/RolloutPercentageConfig',
  component: RolloutPercentageConfig,
  decorators: [
    (Story) => (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-8">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RolloutPercentageConfig>;

const mockVariants: Variant[] = [
  {
    name: 'control',
    description: 'Control variant',
    value: 'false',
  },
  {
    name: 'treatment',
    description: 'Treatment variant',
    value: 'true',
  },
  {
    name: 'variant-a',
    description: 'Variant A',
    value: 'a',
  },
  {
    name: 'variant-b',
    description: 'Variant B',
    value: 'b',
  },
  {
    name: 'variant-c',
    description: 'Variant C',
    value: 'c',
  },
];

const RolloutPercentageConfigWithState = (args: any) => {
  const [distribution, setDistribution] = useState(
    args.distribution || { control: 50, treatment: 50 },
  );

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="p-4 bg-card rounded-lg shadow border border-border text-card-foreground">
        <h3 className="text-lg font-medium mb-4">Rollout Percentage Config</h3>
        <RolloutPercentageConfig
          {...args}
          distribution={distribution}
          onChange={setDistribution}
        />
      </div>

      <div className="p-4 bg-muted/50 rounded-lg border border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Current Distribution:
        </h3>
        <pre className="text-sm font-mono bg-muted p-2 rounded border border-border overflow-x-auto">
          {JSON.stringify(distribution, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export const TwoVariants: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: { control: 50, treatment: 50 },
    variants: mockVariants,
  },
};

export const TwoVariantsUnbalanced: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: { control: 80, treatment: 20 },
    variants: mockVariants,
  },
};

export const ThreeVariants: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: { control: 40, treatment: 30, 'variant-a': 30 },
    variants: mockVariants,
  },
};

export const MultipleVariants: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: {
      control: 25,
      treatment: 25,
      'variant-a': 25,
      'variant-b': 25,
    },
    variants: mockVariants,
  },
};

export const FiveVariants: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: {
      control: 20,
      treatment: 20,
      'variant-a': 20,
      'variant-b': 20,
      'variant-c': 20,
    },
    variants: mockVariants,
  },
};

export const EmptyDistribution: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: {},
    variants: mockVariants,
  },
};

export const SingleVariant: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: { control: 100 },
    variants: mockVariants,
  },
};

export const WithErrors: Story = {
  render: (args) => <RolloutPercentageConfigWithState {...args} />,
  args: {
    distribution: { control: 45, treatment: 45 },
    variants: mockVariants,
    errors: [
      'Features.Targeting.RolloutPercentageForm.totalMustBe100',
      'Features.Targeting.RolloutPercentageForm.invalidDistribution',
    ],
  },
};
