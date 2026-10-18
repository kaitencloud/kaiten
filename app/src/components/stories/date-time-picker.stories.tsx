import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import {
  pickDateTime,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';
import { DateTimePicker } from '../date-time-picker';

const meta = {
  title: 'Components/DateTimePicker',
  component: DateTimePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DateTimePicker>;

export default meta;
type Story = StoryObj<typeof DateTimePicker>;

function DateTimePickerExample({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);

  return (
    <div className="w-[300px] space-y-2">
      <label className="text-sm font-medium" htmlFor="moment">
        Starts (UTC)
      </label>
      <DateTimePicker id="moment" onChange={setValue} value={value} />
      <p className="text-muted-foreground text-xs">
        Holds: <code>{value || '(empty)'}</code>
      </p>
    </div>
  );
}

// A UTC date and time, held as the text a datetime-local input held:
// 2027-03-03T10:00.
export const Default: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByLabelText('Starts (UTC)');

    await pickDateTime(userEvent, trigger, '2027-03-03T10:00');

    await expect(pickerValue(trigger)).toBe('2027-03-03T10:00');
    await expect(canvas.getByText('2027-03-03T10:00')).toBeVisible();
  },
};

export const WithMoment: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="2027-12-31T23:59" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByLabelText('Starts (UTC)');

    await expect(trigger).toHaveTextContent('Dec 31, 2027, 23:59');
  },
};

export const Disabled: Story = {
  args: { onChange: () => {}, value: '2027-03-03T10:00', disabled: true },
};
