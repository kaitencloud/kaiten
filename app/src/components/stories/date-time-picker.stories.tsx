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
  width = 300,
}: {
  initial: string;
  localTimeZone?: string;
  width?: number;
}) {
  const [value, setValue] = useState(initial);

  return (
    <div className="space-y-2" style={{ width }}>
      <label className="text-sm font-medium" htmlFor="moment" id="moment-label">
        Starts (UTC)
      </label>
      <DateTimePicker
        groupLabelledBy="moment-label"
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

const buttonOf = (canvas: ReturnType<typeof within>) =>
  canvas.findByRole('button', { name: 'Starts (UTC)' });

// A UTC date and time, held as the text a datetime-local input held:
// 2027-03-03T10:00. The day is picked on a calendar, the time set beside it.
export const Default: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await buttonOf(canvas);

    await pickDateTime(userEvent, trigger, '2027-03-03T10:00');

    await expect(pickerValue(trigger)).toBe('2027-03-03T10:00');
    await expect(canvas.getByText('Mar 3, 2027')).toBeVisible();
    await expect(canvas.getByRole('spinbutton', { name: 'Hours' })).toHaveValue('10');
    await expect(canvas.getByRole('spinbutton', { name: 'Minutes' })).toHaveValue('00');
  },
};

export const WithMoment: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="2027-12-31T23:59" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await buttonOf(canvas);

    await expect(trigger).toHaveTextContent('Dec 31, 2027');
    await expect(canvas.getByRole('spinbutton', { name: 'Hours' })).toHaveValue('23');
    await expect(canvas.getByRole('spinbutton', { name: 'Minutes' })).toHaveValue('59');
  },
};

// A text the form refuses (a time that is none) is shown as it is, marked
// invalid, and stays until the person sets a time.
export const InvalidTime: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="2027-03-03T25:99" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('spinbutton', { name: 'Hours' }),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(
      canvas.getByText('Enter a time from 00:00 to 23:59.'),
    ).toBeVisible();
  },
};

// Not a moment at all: the button shows the text, marked invalid.
export const InvalidValue: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="2027-13-45T10:00" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await buttonOf(canvas)).toHaveAttribute('aria-invalid', 'true');
  },
};

// In a narrow container (the two-column rows of a form, a dialog, a phone) the
// time field wraps under the button instead of overflowing.
export const Narrow: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <DateTimePickerExample initial="2027-12-31T23:59" width={240} />,
};

export const Light: Story = {
  args: { onChange: () => {}, value: '' },
  globals: { theme: 'light' },
  render: () => <DateTimePickerExample initial="2027-12-31T23:59" />,
};

export const Dark: Story = {
  args: { onChange: () => {}, value: '' },
  globals: { theme: 'dark' },
  render: () => <DateTimePickerExample initial="2027-12-31T23:59" />,
};

// The browser's clock is not UTC (here Paris): the moment is also worded on it,
// under the pair, and the time field's description says it. The value stays the
// UTC text.
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
    const trigger = await buttonOf(canvas);

    await expect(canvas.getByText('= 11:00 in Paris (CET)')).toBeVisible();
    await expect(trigger).toHaveAccessibleDescription('Mar 3, 2027');
    await expect(pickerValue(trigger)).toBe('2027-03-03T10:00');

    const time = canvas.getByRole('group', {
      name: 'Time (UTC), your local time is shown below',
    });

    await expect(time).toHaveAccessibleDescription('= 11:00 in Paris (CET)');
  },
};

export const WithLocalTimeDark: Story = {
  ...WithLocalTime,
  globals: { theme: 'dark' },
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

export const DisabledEmpty: Story = {
  args: { onChange: () => {}, value: '', disabled: true },
};
