import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChartEmptyState } from '../chart-empty-state';

const meta = {
  title: 'Components/ChartEmptyState',
  component: ChartEmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[480px] h-[240px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChartEmptyState>;

export default meta;
type Story = StoryObj<typeof ChartEmptyState>;

export const Default: Story = {};

export const CustomMessage: Story = {
  args: {
    message: 'No usage data for the selected period',
  },
};
