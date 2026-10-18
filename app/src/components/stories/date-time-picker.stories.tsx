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

// The stories pin the zone of the clock, UTC unless one says otherwise: the local
// time shown under the picker is the one of the browser, which differs from
// machine to machine.
function DateTimePickerExample({
  initial,
  localTimeZone = 'UTC',
}: {
  initial: string;
  localTimeZone?: string;
}) {
  const [value, setValue] = useState(initial);

  return (
    <div className="w-[300px] space-y-2">
      <label className="text-sm font-medium" htmlFor="moment">
        Starts (UTC)
      </label>
      <DateTimePicker
        id="moment"
        localTimeZone={localTimeZone}
        onChange={setValue}
        value={value}
      />
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

// The browser's clock is not UTC (here Paris): the moment is also worded on it,
// under the button and under the time field, as a person who types the hour on
// their own clock reads it. The value stays the UTC text.
export const WithLocalTime: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => (
    <DateTimePickerExample
      initial="2027-03-03T10:00"
      localTimeZone="Europe/Paris"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByLabelText('Starts (UTC)');

    await expect(canvas.getByText('= 11:00 in Paris (CET)')).toBeVisible();
    await expect(trigger).toHaveAccessibleDescription(
      'Mar 3, 2027, 10:00 = 11:00 in Paris (CET)',
    );
    await expect(pickerValue(trigger)).toBe('2027-03-03T10:00');

    await userEvent.click(trigger);
    const time = await within(document.body).findByLabelText(
      'Time (UTC), your local time is shown below',
    );

    await expect(time).toHaveAccessibleDescription('= 11:00 in Paris (CET)');
  },
};

// When the day is not the UTC day on that clock, the hint says which one it is.
export const WithLocalTimeOnAnotherDay: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => (
    <DateTimePickerExample
      initial="2027-03-03T20:30"
      localTimeZone="Asia/Tokyo"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText('= Mar 4, 05:30 in Tokyo (GMT+9)'),
    ).toBeVisible();
  },
};

export const Disabled: Story = {
  args: { onChange: () => {}, value: '2027-03-03T10:00', disabled: true },
};
