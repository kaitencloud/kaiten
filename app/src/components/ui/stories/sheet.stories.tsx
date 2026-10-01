import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '../label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../sheet';

const meta = {
  title: 'Components/UI/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof Sheet>;

const profileFields = (
  <div className="grid gap-4 px-4">
    <div className="grid gap-2">
      <Label htmlFor="sheet-name">Name</Label>
      <Input id="sheet-name" defaultValue="Acme Corp" />
    </div>
    <div className="grid gap-2">
      <Label htmlFor="sheet-owner">Owner</Label>
      <Input id="sheet-owner" defaultValue="ops@acme.test" />
    </div>
  </div>
);

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="outline">Open sheet</Button>} />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit customer</SheetTitle>
          <SheetDescription>
            Update the customer metadata used across instances and licenses.
          </SheetDescription>
        </SheetHeader>
        {profileFields}
        <SheetFooter>
          <SheetClose render={<Button variant="outline">Cancel</Button>} />
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSideOpen: Story = {
  render: () => (
    <Sheet open onOpenChange={() => {}}>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Narrow the operational view by ownership and status.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-4 text-sm">
          <Button variant="secondary" className="justify-start">
            Active customers
          </Button>
          <Button variant="ghost" className="justify-start">
            Near license limit
          </Button>
          <Button variant="ghost" className="justify-start">
            Missing owner
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
