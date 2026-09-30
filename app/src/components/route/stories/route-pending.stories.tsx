import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoutePending } from '../route-pending';

const meta = {
  title: 'Components/Route/RoutePending',
  component: RoutePending,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoutePending>;

export default meta;
type Story = StoryObj<typeof RoutePending>;

export const Default: Story = {};

export const CustomMessage: Story = {
  args: {
    message: 'Loading targeting rules…',
  },
};
