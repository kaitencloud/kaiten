import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
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
