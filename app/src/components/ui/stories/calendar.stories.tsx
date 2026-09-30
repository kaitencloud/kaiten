import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '../calendar';

const meta = {
  title: 'Components/UI/Calendar',
  component: Calendar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof Calendar>;

const baseMonth = new Date(2026, 3, 1);

export const SingleSelection: Story = {
  render: function SingleSelectionStory() {
    const [selected, setSelected] = useState<Date | undefined>(
      new Date(2026, 3, 24),
    );

    return (
      <Calendar
        mode="single"
        month={baseMonth}
        selected={selected}
        onSelect={setSelected}
      />
    );
  },
};

export const RangeSelection: Story = {
  render: function RangeSelectionStory() {
    const [selected, setSelected] = useState<DateRange | undefined>({
      from: new Date(2026, 3, 14),
      to: new Date(2026, 3, 21),
    });

    return (
      <Calendar
        mode="range"
        month={baseMonth}
        selected={selected}
        onSelect={setSelected}
      />
    );
  },
};

export const WithDropdownCaption: Story = {
  render: () => (
    <Calendar
      mode="single"
      captionLayout="dropdown"
      defaultMonth={baseMonth}
      selected={new Date(2026, 3, 24)}
      startMonth={new Date(2025, 0, 1)}
      endMonth={new Date(2027, 11, 31)}
    />
  ),
};
