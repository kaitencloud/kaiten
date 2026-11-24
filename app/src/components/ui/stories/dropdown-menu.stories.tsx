import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown, CircleCheck, FileX } from 'lucide-react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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

function ColumnsMenu() {
  const [shown, setShown] = useState({ customer: true, region: true });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline">
            Columns
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={shown.customer}
            onCheckedChange={(customer) => setShown({ ...shown, customer })}
          >
            Customer
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={shown.region}
            onCheckedChange={(region) => setShown({ ...shown, region })}
          >
            Region
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// On/off choices made in one go: a checkbox item toggles and leaves the menu
// open, and its state is announced (`aria-checked`).
export const CheckboxItems: Story = {
  render: () => <ColumnsMenu />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Columns' }));

    const menu = within(await within(document.body).findByRole('menu'));
    const region = menu.getByRole('menuitemcheckbox', { name: 'Region' });
    await expect(region).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(region);
    await expect(region).toHaveAttribute('aria-checked', 'false');
    await expect(within(document.body).getByRole('menu')).toBeInTheDocument();

    // Escape closes it, once its exit animation is over.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('menu')).toBeNull(),
    );
  },
};
