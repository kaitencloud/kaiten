import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown, CircleCheck, FileX } from 'lucide-react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';

const meta = {
  title: 'Components/UI/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof DropdownMenu>;

const onPaid = fn();
const onWriteOff = fn();

// The actions that do not fit beside each other, behind one button. Choosing an
// item runs it and closes the menu; one that cannot be undone reads as
// destructive; a disabled one stays listed.
export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline">
            Actions
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Invoice</DropdownMenuLabel>
          <DropdownMenuItem onClick={onPaid}>
            <CircleCheck />
            Mark as paid
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Recompose</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onWriteOff} variant="destructive">
          <FileX />
          Write off
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Actions' }));

    const menu = within(await within(document.body).findByRole('menu'));
    await expect(menu.getByRole('menuitem', { name: 'Recompose' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(menu.getByRole('menuitem', { name: 'Mark as paid' }));
    await expect(onPaid).toHaveBeenCalledTimes(1);
    // Choosing an item closes the menu, once its exit animation is over.
    await waitFor(() =>
      expect(within(document.body).queryByRole('menu')).toBeNull(),
    );
  },
};
