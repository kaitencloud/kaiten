import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '../form-dialog';

const meta = {
  title: 'Components/Dialog/FormDialog',
  component: FormDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FormDialog>;

export default meta;
type Story = StoryObj<typeof FormDialog>;

// Simple form example
function SimpleFormExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Open Form Dialog</Button>
      <FormDialog open={open} onOpenChange={setOpen}>
        <FormDialog.Header>
          <FormDialog.Title>Simple Form</FormDialog.Title>
          <FormDialog.Description>
            Fill out this simple form
          </FormDialog.Description>
        </FormDialog.Header>
        <FormDialog.Content>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Enter your name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="Enter your email" />
          </div>
        </FormDialog.Content>
        <FormDialog.Footer>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Submit</Button>
        </FormDialog.Footer>
      </FormDialog>
    </div>
  );
}

// Long scrollable form example with a wider panel
function LongFormExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Open Long Form Dialog</Button>
      <FormDialog open={open} onOpenChange={setOpen} className="sm:max-w-5xl">
        <FormDialog.Header>
          <FormDialog.Title>Long Form with Scrollable Content</FormDialog.Title>
          <FormDialog.Description>
            This wide form has a lot of content that scrolls while the header
            and footer stay visible
          </FormDialog.Description>
        </FormDialog.Header>
        <FormDialog.Content>
          {Array.from({ length: 10 }).map((_, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- no filter
            <div key={index} className="space-y-2">
              <Label htmlFor={`field-${index}`}>Field {index + 1}</Label>
              <Input id={`field-${index}`} placeholder={`Field ${index + 1}`} />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Enter a long description"
              rows={6}
            />
          </div>
        </FormDialog.Content>
        <FormDialog.Footer>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Submit</Button>
        </FormDialog.Footer>
      </FormDialog>
    </div>
  );
}

// Form without footer example
function NoFooterExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Open Form (No Footer)</Button>
      <FormDialog open={open} onOpenChange={setOpen}>
        <FormDialog.Header>
          <FormDialog.Title>Form Without Footer</FormDialog.Title>
          <FormDialog.Description>
            This form doesn't have a footer - buttons are in the form itself
          </FormDialog.Description>
        </FormDialog.Header>
        <FormDialog.Content>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" placeholder="Enter username" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter password"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Login</Button>
          </div>
        </FormDialog.Content>
      </FormDialog>
    </div>
  );
}

export const Simple: Story = {
  render: () => <SimpleFormExample />,
};

export const LongScrollable: Story = {
  render: () => <LongFormExample />,
};

export const NoFooter: Story = {
  render: () => <NoFooterExample />,
};
