import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../select';
import { Label } from '../label';

const meta = {
  title: 'Components/UI/Select',
  component: Select,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <Select items={[{ value: 'apple', label: 'Apple' }, { value: 'banana', label: 'Banana' }, { value: 'orange', label: 'Orange' }]}>
      <SelectTrigger aria-label="Fruit" className="w-[180px]">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="orange">Orange</SelectItem>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox');
    await userEvent.click(trigger);
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Banana' }));
    await expect(trigger).toHaveTextContent('Banana');
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
};

// A list is never wider than the space the page leaves it: an option longer than the screen
// wraps, and the page does not scroll sideways because of it.
const LONG_OPTION = Array.from(
  { length: 6 },
  () => 'A plan whose name and terms are written out in full, longer than any screen that shows it,',
).join(' ');

export const LongOptions: Story = {
  render: () => (
    <Select>
      <SelectTrigger aria-label="Plan" className="w-[180px]">
        <SelectValue placeholder="Select a plan" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="long">{LONG_OPTION}</SelectItem>
        <SelectItem value="short">Short</SelectItem>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox'));
    await within(document.body).findByRole('option', { name: LONG_OPTION });
    const popup = document.querySelector('[data-slot="select-content"]') as HTMLElement;
    // Measured where it comes to rest: it zooms in as it opens.
    await Promise.all(popup.getAnimations().map((animation) => animation.finished));

    await expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  },
};

export const WithGroups: Story = {
  render: () => (
    <Select>
      <SelectTrigger aria-label="Timezone" className="w-[200px]">
        <SelectValue placeholder="Select a timezone" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
          <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
          <SelectItem value="mst">Mountain Standard Time (MST)</SelectItem>
          <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Europe</SelectLabel>
          <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
          <SelectItem value="cet">Central European Time (CET)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger aria-label="Fruit" className="w-[180px]">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const StackedField: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Base UI renders a visually hidden `<input>` after the trigger, so the trigger is never the last child of its container. Stack a Select under its label with `grid grid-cols-1 gap-2` (or `flex flex-col gap-2`), not `space-y-*`: `space-y-*` puts a margin under every child but the last, which here is the hidden input, so the trigger gains a trailing margin and the container grows. Keep `grid-cols-1`: a bare `grid` lets a long selected value widen the column instead of being clipped by the trigger.",
      },
    },
  },
  render: () => (
    <div data-testid="stack" className="grid w-[320px] grid-cols-1 gap-2 rounded-md border p-4">
      <Label htmlFor="stacked-release">Release</Label>
      <Select
        defaultValue="beta"
        items={[
          { value: 'stable', label: 'v1.0.0 - Initial stable release' },
          { value: 'beta', label: 'v2.0.0-beta - Major update with breaking changes and a description too long to fit' },
        ]}
      >
        <SelectTrigger id="stacked-release" className="w-full">
          <SelectValue placeholder="Select a release" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stable">v1.0.0 - Initial stable release</SelectItem>
          <SelectItem value="beta">
            v2.0.0-beta - Major update with breaking changes and a description too long to fit
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stack = canvas.getByTestId('stack');
    const trigger = canvas.getByRole('combobox');
    const box = getComputedStyle(stack);
    // The trigger must sit flush on the container's padding: nothing, margin or
    // hidden input, may take room below it.
    const room = stack.getBoundingClientRect().bottom - trigger.getBoundingClientRect().bottom;
    await expect(room).toBeCloseTo(parseFloat(box.paddingBottom) + parseFloat(box.borderBottomWidth), 0);
    // A long selected value is clipped by the trigger: it must not widen the column.
    const content = stack.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
    await expect(trigger.getBoundingClientRect().width).toBeCloseTo(content, 0);
  },
};
