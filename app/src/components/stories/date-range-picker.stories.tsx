import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '../date-range-picker';

const meta = {
  title: 'Components/DateRangePicker',
  component: DateRangePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof DateRangePicker>;

function DateRangePickerExample() {
  const [date, setDate] = useState<DateRange | undefined>(undefined);

  return (
    <div className="w-[600px]">
      <DateRangePicker date={date} onSelect={setDate} />
    </div>
  );
}

export const Default: Story = {
  render: () => <DateRangePickerExample />,
};

export const WithDefaultRange: Story = {
  render: function WithDefaultRangeDateRangePickerStory() {
    const [date, setDate] = useState<DateRange | undefined>({
      from: new Date(2024, 0, 1),
      to: new Date(2024, 0, 15),
    });
    return (
      <div className="w-[600px]">
        <DateRangePicker date={date} onSelect={setDate} />
      </div>
    );
  },
};

export const WithSingleDate: Story = {
  render: function WithSingleDateDateRangePickerStory() {
    const [date, setDate] = useState<DateRange | undefined>({
      from: new Date(),
      to: undefined,
    });
    return (
      <div className="w-[600px]">
        <DateRangePicker date={date} onSelect={setDate} />
      </div>
    );
  },
};
