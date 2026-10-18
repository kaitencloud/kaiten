import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import {
  clearPicker,
  pickDay,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';
import { DateInputPicker } from '../date-input-picker';

const meta = {
  title: 'Components/DateInputPicker',
  component: DateInputPicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DateInputPicker>;

export default meta;
type Story = StoryObj<typeof DateInputPicker>;

function DateInputPickerExample({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);

  return (
    <div className="w-[300px] space-y-2">
      <label className="text-sm font-medium" htmlFor="day">
        From (UTC)
      </label>
      <DateInputPicker id="day" onChange={setValue} value={value} />
      <p className="text-muted-foreground text-xs">
        Holds: <code>{value || '(empty)'}</code>
      </p>
    </div>
  );
}

// A UTC day, held as the text a date input held: 2027-03-01.
export const Default: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateInputPickerExample initial="" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByLabelText('From (UTC)');

    await pickDay(userEvent, trigger, '2027-03-01');

    await expect(pickerValue(trigger)).toBe('2027-03-01');
    await expect(canvas.getByText('2027-03-01')).toBeVisible();
  },
};

export const WithDay: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateInputPickerExample initial="2027-03-01" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByLabelText('From (UTC)');

    await expect(trigger).toHaveTextContent('Mar 1, 2027');

    await clearPicker(userEvent, trigger);

    await expect(pickerValue(trigger)).toBe('');
  },
};

export const Disabled: Story = {
  args: { onChange: () => {}, value: '2027-03-01', disabled: true },
};
