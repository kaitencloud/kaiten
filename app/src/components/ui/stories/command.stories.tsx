import type { Meta, StoryObj } from '@storybook/react-vite';
import { Activity, Gauge, Search, Settings, Shield } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '../command';

const meta = {
  title: 'Components/UI/Command',
  component: Command,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof Command>;

const commandItems = (
  <CommandList>
    <CommandEmpty>No result found.</CommandEmpty>
    <CommandGroup heading="Navigation">
      <CommandItem>
        <Gauge />
        Dashboard
        <CommandShortcut>G D</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <Shield />
        Entitlements
        <CommandShortcut>G E</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <Activity />
        Audit trail
        <CommandShortcut>G A</CommandShortcut>
      </CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Actions">
      <CommandItem>
        <Search />
        Search feature flags
      </CommandItem>
      <CommandItem disabled>
        <Settings />
        Disabled command
      </CommandItem>
    </CommandGroup>
  </CommandList>
);

export const Default: Story = {
  render: () => (
    <Command className="w-[420px] rounded-lg border shadow-md">
      <CommandInput placeholder="Search commands..." />
      {commandItems}
    </Command>
  ),
};

export const DialogOpen: Story = {
  render: () => (
    <CommandDialog open onOpenChange={() => {}} title="Command palette">
      <CommandInput placeholder="Type a command or search..." />
      {commandItems}
    </CommandDialog>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
