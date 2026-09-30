import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { GradientButton } from '../gradient-button';

const meta: Meta<typeof GradientButton> = {
  title: 'Components/GradientButton',
  component: GradientButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <StorybookRouter>
        <Story />
      </StorybookRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GradientButton>;

export const ButtonAction: Story = {
  args: {
    label: 'Create entitlement',
    onClick: fn(),
  },
};

export const LinkAction: Story = {
  args: {
    label: 'New release',
    to: '/',
  },
};
