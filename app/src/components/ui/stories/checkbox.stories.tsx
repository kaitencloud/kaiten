import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { Checkbox } from '../checkbox';
import { Label } from '../label';

const meta = {
  title: 'Components/UI/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: function DefaultCheckboxStory() {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox
        aria-label="Accept terms"
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
      />
    );
  },
};

export const WithLabel: Story = {
  render: function WithLabelCheckboxStory() {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          id="terms"
          checked={checked}
          onCheckedChange={(value) => setChecked(value === true)}
        />
        <Label htmlFor="terms">Accept terms and conditions</Label>
      </div>
    );
  },
};

// A box that stands for a set of which some, not all, are checked: it draws a
// minus, reads as "mixed", and a click checks the whole set.
export const Indeterminate: Story = {
  render: function IndeterminateCheckboxStory() {
    const [items, setItems] = useState([true, false, false]);
    const all = items.every(Boolean);
    const some = !all && items.some(Boolean);

    return (
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="all-items"
            checked={all}
            indeterminate={some}
            onCheckedChange={(value) =>
              setItems(items.map(() => value === true))
            }
          />
          <Label htmlFor="all-items">All items</Label>
        </div>
        {items.map((checked, index) => (
          <div key={index} className="ml-6 flex items-center space-x-2">
            <Checkbox
              id={`item-${index}`}
              checked={checked}
              onCheckedChange={(value) =>
                setItems(
                  items.map((item, i) => (i === index ? value === true : item)),
                )
              }
            />
            <Label htmlFor={`item-${index}`}>{`Item ${index + 1}`}</Label>
          </div>
        ))}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const all = canvas.getByRole('checkbox', { name: 'All items' });

    await expect(all).toHaveAttribute('aria-checked', 'mixed');
    await userEvent.click(all);
    await expect(all).toHaveAttribute('aria-checked', 'true');
    await expect(
      canvas.getByRole('checkbox', { name: 'Item 3' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled" disabled />
        <Label htmlFor="disabled">Disabled unchecked</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="disabled-checked" disabled checked />
        <Label htmlFor="disabled-checked">Disabled checked</Label>
      </div>
    </div>
  ),
};

export const Multiple: Story = {
  render: function MultipleCheckboxStory() {
    const [items, setItems] = useState([
      { id: '1', label: 'Item 1', checked: false },
      { id: '2', label: 'Item 2', checked: true },
      { id: '3', label: 'Item 3', checked: false },
    ]);

    return (
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center space-x-2">
            <Checkbox
              id={item.id}
              checked={item.checked}
              onCheckedChange={(checked) => {
                setItems(
                  items.map((i) =>
                    i.id === item.id ? { ...i, checked: checked === true } : i
                  )
                );
              }}
            />
            <Label htmlFor={item.id}>{item.label}</Label>
          </div>
        ))}
      </div>
    );
  },
};
