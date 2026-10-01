import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Components/UI/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline">Hover me</Button>} />
      <TooltipContent>
        <p>This is a tooltip</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const WithLongText: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline">Hover for details</Button>} />
      <TooltipContent className="max-w-xs">
        <p>
          This is a longer tooltip with more detailed information that wraps to multiple lines.
        </p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Multiple: Story = {
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger render={<Button>Save</Button>} />
        <TooltipContent>
          <p>Save your changes</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger render={<Button variant="outline">Cancel</Button>} />
        <TooltipContent>
          <p>Discard changes</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger render={<Button variant="destructive">Delete</Button>} />
        <TooltipContent>
          <p>Permanently delete this item</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};
