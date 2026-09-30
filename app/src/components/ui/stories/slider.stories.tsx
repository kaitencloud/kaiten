import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Slider } from '../slider';
import { Label } from '../label';

const meta = {
  title: 'Components/UI/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  render: function DefaultSliderStory() {
    const [value, setValue] = useState([50]);
    return (
      <div className="w-[300px]">
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

export const WithLabel: Story = {
  render: function WithLabelSliderStory() {
    const [value, setValue] = useState([25]);
    return (
      <div className="w-[300px] space-y-4">
        <div className="flex justify-between">
          <Label>Volume</Label>
          <span className="text-sm text-muted-foreground">{value[0]}%</span>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

export const Range: Story = {
  render: function RangeSliderStory() {
    const [value, setValue] = useState([25, 75]);
    return (
      <div className="w-[300px] space-y-4">
        <div className="flex justify-between">
          <Label>Price Range</Label>
          <span className="text-sm text-muted-foreground">
            ${value[0]} - ${value[1]}
          </span>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[50]} max={100} step={1} disabled />
    </div>
  ),
};

export const CustomStep: Story = {
  render: function CustomStepSliderStory() {
    const [value, setValue] = useState([50]);
    return (
      <div className="w-[300px] space-y-4">
        <div className="flex justify-between">
          <Label>Value (step: 10)</Label>
          <span className="text-sm text-muted-foreground">{value[0]}</span>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={10} />
      </div>
    );
  },
};
