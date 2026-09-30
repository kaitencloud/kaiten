import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DialogFormSkeleton,
  DialogFormSkeletonCard,
} from '../dialog-form-skeleton';

const meta = {
  title: 'Components/Dialog/DialogFormSkeleton',
  component: DialogFormSkeleton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof DialogFormSkeleton>;

export default meta;
type Story = StoryObj<typeof DialogFormSkeleton>;

export const ThreeFields: Story = {
  args: { fields: 3 },
  render: (args) => (
    <div className="w-[480px] rounded-lg border bg-background p-6">
      <DialogFormSkeleton {...args} />
    </div>
  ),
};

export const SingleField: Story = {
  args: { fields: 1 },
  render: (args) => (
    <div className="w-[480px] rounded-lg border bg-background p-6">
      <DialogFormSkeleton {...args} />
    </div>
  ),
};

export const StackedStepCard: StoryObj = {
  name: 'Stacked stage card (4 fields)',
  render: () => (
    <div className="w-[480px]">
      <DialogFormSkeletonCard title="New entitlement" fields={4} />
    </div>
  ),
};
