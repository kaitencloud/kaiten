import type { Meta, StoryObj } from '@storybook/react-vite';
import { Textarea } from '../textarea';
import { Label } from '../label';

const meta = {
  title: 'Components/UI/Textarea',
  component: Textarea,
  args: { 'aria-label': 'Message' },
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: 'Type your message here.',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="w-[400px] space-y-2">
      <Label htmlFor="message">Your message</Label>
      <Textarea id="message" placeholder="Type your message here." />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    placeholder: 'Disabled textarea',
    disabled: true,
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: 'This is a pre-filled textarea with some content.',
  },
};

export const CustomRows: Story = {
  render: () => (
    <div className="w-[400px] space-y-4">
      <div className="space-y-2">
        <Label>Small (3 rows)</Label>
        <Textarea placeholder="Small textarea" rows={3} />
      </div>
      <div className="space-y-2">
        <Label>Large (10 rows)</Label>
        <Textarea placeholder="Large textarea" rows={10} />
      </div>
    </div>
  ),
};
