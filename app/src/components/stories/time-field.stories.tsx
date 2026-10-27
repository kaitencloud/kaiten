import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { TimeField } from '../time-field';

const meta = {
  title: 'Components/TimeField',
  component: TimeField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TimeField>;

export default meta;
type Story = StoryObj<typeof TimeField>;

function TimeFieldExample({
  initial,
  invalid,
  disabled,
}: {
  initial: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);

  return (
    <div className="w-[200px] space-y-2">
      <TimeField
        aria-invalid={invalid}
        aria-label="Starts at (UTC)"
        disabled={disabled}
        onChange={setValue}
        value={value}
      />
      <p className="text-muted-foreground text-xs">
        Holds: <code>{value || '(empty)'}</code>
      </p>
    </div>
  );
}

// A time on the 24-hour clock, two segments and a clock that opens two columns.
// Digits fill a segment and move on: 1 then 6 is 16, and 3 is 03.
export const Default: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('spinbutton', { name: 'Hours' }));
    await userEvent.keyboard('1630');

    await expect(canvas.getByText('16:30')).toBeVisible();
  },
};

export const Filled: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="09:30" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const hours = await canvas.findByRole('spinbutton', { name: 'Hours' });

    await expect(hours).toHaveValue('09');
    await expect(hours).toHaveAttribute('aria-valuenow', '9');
    await expect(canvas.getByRole('spinbutton', { name: 'Minutes' })).toHaveValue('30');
  },
};

// A time half filled: the empty segment shows `--`, and the field is marked
// invalid once the form refuses it.
export const Incomplete: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="09:--" invalid />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const minutes = await canvas.findByRole('spinbutton', { name: 'Minutes' });

    await expect(minutes).toHaveValue('');
    await expect(minutes).toHaveAttribute('placeholder', '--');
    await expect(minutes).toHaveAttribute('aria-invalid', 'true');
  },
};

// Not a time (`25:99`): shown as it is and marked invalid, not corrected.
export const Invalid: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="25:99" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('spinbutton', { name: 'Hours' }),
    ).toHaveAttribute('aria-invalid', 'true');
  },
};

export const Disabled: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample disabled initial="09:30" />,
};

// The clock opens the columns: the chosen value is centred and filled, the
// focused column is outlined, and a chevron above and below moves it by one.
export const Columns: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="10:30" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose a time' }),
    );
    const hours = await within(document.body).findByRole('listbox', {
      name: 'Hours',
    });

    await waitFor(() => expect(hours).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');

    await expect(canvas.getByText('11:30')).toBeVisible();
  },
};

// The columns have no empty rows: at 00:00 the first option sits on the first
// row of each column, and at 23:59 the last option sits on the last row.
async function expectFilled(column: HTMLElement, edge: 'first' | 'last') {
  const options = within(column).getAllByRole('option');
  const box = column.getBoundingClientRect();
  const option = (edge === 'first' ? options[0] : options.at(-1))!;
  const rect = option.getBoundingClientRect();

  await expect(
    edge === 'first' ? rect.top - box.top : box.bottom - rect.bottom,
  ).toBeLessThan(1);
}

export const ColumnsStart: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="00:00" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose a time' }),
    );
    const body = within(document.body);

    await expectFilled(await body.findByRole('listbox', { name: 'Hours' }), 'first');
    await expectFilled(body.getByRole('listbox', { name: 'Minutes' }), 'first');
  },
};

export const ColumnsEnd: Story = {
  args: { onChange: () => {}, value: '' },
  render: () => <TimeFieldExample initial="23:59" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose a time' }),
    );
    const body = within(document.body);

    await expectFilled(await body.findByRole('listbox', { name: 'Hours' }), 'last');
    await expectFilled(body.getByRole('listbox', { name: 'Minutes' }), 'last');
  },
};

export const ColumnsLight: Story = {
  ...Columns,
  globals: { theme: 'light' },
};

export const ColumnsDark: Story = {
  ...Columns,
  globals: { theme: 'dark' },
};

export const Light: Story = {
  args: { onChange: () => {}, value: '' },
  globals: { theme: 'light' },
  render: () => <TimeFieldExample initial="10:30" />,
};

export const Dark: Story = {
  args: { onChange: () => {}, value: '' },
  globals: { theme: 'dark' },
  render: () => <TimeFieldExample initial="10:30" />,
};
