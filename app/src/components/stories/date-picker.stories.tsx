import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DatePicker } from '../date-picker';

const meta = {
  title: 'Components/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof DatePicker>;

function DatePickerExample() {
  const [date, setDate] = useState<Date | undefined>(undefined);

  return (
    <div className="w-[300px]">
      <DatePicker date={date} onSelect={setDate} />
    </div>
  );
}

export const Default: Story = {
  render: () => <DatePickerExample />,
};

export const WithDefaultDate: Story = {
  render: function WithDefaultDatePickerStory() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <div className="w-[300px]">
        <DatePicker date={date} onSelect={setDate} />
      </div>
    );
  },
};

export const Disabled: Story = {
  render: function DisabledDatePickerStory() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <div className="w-[300px]">
        <DatePicker date={date} onSelect={setDate} disabled />
      </div>
    );
  },
};

export const WithCustomPlaceholder: Story = {
  render: function WithCustomPlaceholderDatePickerStory() {
    const [date, setDate] = useState<Date | undefined>(undefined);
    return (
      <div className="w-[300px]">
        <DatePicker
          date={date}
          onSelect={setDate}
          placeholder="Choose a date"
        />
      </div>
    );
  },
};
