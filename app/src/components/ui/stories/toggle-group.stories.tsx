import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group';

const meta = {
  title: 'Components/UI/ToggleGroup',
  component: ToggleGroup,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof ToggleGroup>;

export const Single: Story = {
  render: () => (
    <ToggleGroup>
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeft className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenter className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRight className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Multiple: Story = {
  render: () => (
    <ToggleGroup multiple>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Bold className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Italic className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Underline className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="space-y-4">
      <ToggleGroup variant="default">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup variant="outline">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4">
      <ToggleGroup size="sm">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-3 w-3" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-3 w-3" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-3 w-3" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup size="default">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup size="lg">
        <ToggleGroupItem value="left">
          <AlignLeft className="h-5 w-5" />
        </ToggleGroupItem>
        <ToggleGroupItem value="center">
          <AlignCenter className="h-5 w-5" />
        </ToggleGroupItem>
        <ToggleGroupItem value="right">
          <AlignRight className="h-5 w-5" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
};
