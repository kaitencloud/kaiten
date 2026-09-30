import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ActionAccordion,
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '@/components/ui/action-accordion';

const meta = {
  title: 'Components/ActionAccordion',
  component: ActionAccordion,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ActionAccordion>;

export default meta;
type Story = StoryObj<typeof ActionAccordion>;

export const Default: Story = {
  render: () => (
    <ActionAccordion type="single" collapsible className="w-full">
      <ActionAccordionItem value="item-1">
        <ActionAccordionHeader>
          <ActionAccordionTrigger>
            <div className="flex flex-col items-start">
              <span className="font-semibold">Item 1</span>
              <span className="text-sm text-muted-foreground">
                Click to expand
              </span>
            </div>
          </ActionAccordionTrigger>
          <ActionAccordionActions>
            <Button variant="ghost" size="icon-sm">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Trash2 className="h-4 w-4" />
            </Button>
          </ActionAccordionActions>
        </ActionAccordionHeader>
        <ActionAccordionContent>
          <p className="text-sm text-muted-foreground">
            This is the content of item 1. You can put any content here.
          </p>
        </ActionAccordionContent>
      </ActionAccordionItem>
    </ActionAccordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <ActionAccordion type="single" collapsible className="w-full">
      <ActionAccordionItem value="item-1">
        <ActionAccordionHeader>
          <ActionAccordionTrigger>
            <div className="flex flex-col items-start">
              <span className="font-semibold">Project Alpha</span>
              <span className="text-sm text-muted-foreground">
                Active project
              </span>
            </div>
          </ActionAccordionTrigger>
          <ActionAccordionActions>
            <Button variant="ghost" size="icon-sm">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Trash2 className="h-4 w-4" />
            </Button>
          </ActionAccordionActions>
        </ActionAccordionHeader>
        <ActionAccordionContent>
          <div className="space-y-2">
            <p className="text-sm">Status: Active</p>
            <p className="text-sm">Team: 5 members</p>
            <p className="text-sm text-muted-foreground">
              Last updated: 2 hours ago
            </p>
          </div>
        </ActionAccordionContent>
      </ActionAccordionItem>

      <ActionAccordionItem value="item-2">
        <ActionAccordionHeader>
          <ActionAccordionTrigger>
            <div className="flex flex-col items-start">
              <span className="font-semibold">Project Beta</span>
              <span className="text-sm text-muted-foreground">
                In development
              </span>
            </div>
          </ActionAccordionTrigger>
          <ActionAccordionActions>
            <Button variant="ghost" size="icon-sm">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Trash2 className="h-4 w-4" />
            </Button>
          </ActionAccordionActions>
        </ActionAccordionHeader>
        <ActionAccordionContent>
          <div className="space-y-2">
            <p className="text-sm">Status: In Development</p>
            <p className="text-sm">Team: 3 members</p>
            <p className="text-sm text-muted-foreground">
              Last updated: 1 day ago
            </p>
          </div>
        </ActionAccordionContent>
      </ActionAccordionItem>

      <ActionAccordionItem value="item-3">
        <ActionAccordionHeader>
          <ActionAccordionTrigger>
            <div className="flex flex-col items-start">
              <span className="font-semibold">Project Gamma</span>
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
          </ActionAccordionTrigger>
          <ActionAccordionActions>
            <Button variant="ghost" size="icon-sm">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm">
              <Trash2 className="h-4 w-4" />
            </Button>
          </ActionAccordionActions>
        </ActionAccordionHeader>
        <ActionAccordionContent>
          <div className="space-y-2">
            <p className="text-sm">Status: Completed</p>
            <p className="text-sm">Team: 8 members</p>
            <p className="text-sm text-muted-foreground">
              Completed: 1 week ago
            </p>
          </div>
        </ActionAccordionContent>
      </ActionAccordionItem>
    </ActionAccordion>
  ),
};
