import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { NumberInput } from '../number-input';

const meta = {
  title: 'Components/UI/NumberInput',
  component: NumberInput,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[280px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NumberInput>;

export default meta;
type Story = StoryObj<typeof NumberInput>;

function NumberInputExample(props: React.ComponentProps<typeof NumberInput>) {
  const [value, setValue] = useState<number | null>(props.defaultValue ?? null);

  return (
    <NumberInput
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        props.onValueChange?.(next);
      }}
    />
  );
}

export const Default: Story = {
  render: (args) => <NumberInputExample {...args} />,
  args: {
    placeholder: 'Enter a number',
    defaultValue: 0,
  },
};

export const Bounded: Story = {
  render: (args) => <NumberInputExample {...args} />,
  args: {
    min: 0,
    max: 100,
    step: 5,
    defaultValue: 50,
  },
};

export const Disabled: Story = {
  render: (args) => <NumberInputExample {...args} />,
  args: {
    disabled: true,
    defaultValue: 12,
  },
};

export const ReadOnly: Story = {
  render: (args) => <NumberInputExample {...args} />,
  args: {
    readOnly: true,
    defaultValue: 7,
  },
};

export const Invalid: Story = {
  render: (args) => <NumberInputExample {...args} />,
  args: {
    'aria-invalid': true,
    defaultValue: -1,
  },
};
