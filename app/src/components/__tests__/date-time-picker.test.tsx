import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import {
  clearPicker,
  pickDateTime,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';
import {
  TEST_ZONES,
  TEST_ZONES_UTC_DAY,
  useTimeZone,
} from '@/test-fixtures/time-zone';
import { DateTimePicker } from '../date-time-picker';

beforeAll(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
});

afterAll(() => {
  testI18n.removeResourceBundle('en', 'translation');
});

function Harness({
  initial = '',
  onBlur,
  onChange,
}: {
  initial?: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <label htmlFor="starts">Starts (UTC)</label>
      <DateTimePicker
        id="starts"
        onBlur={onBlur}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        value={value}
      />
    </>
  );
}

const trigger = () => screen.getByLabelText('Starts (UTC)');
const timeField = () => screen.getByLabelText('Time (UTC)');

describe('DateTimePicker', () => {
  it('is a button named by its label, with a placeholder while nothing is chosen', () => {
    render(<Harness />);

    expect(trigger().tagName).toBe('BUTTON');
    expect(trigger()).toHaveTextContent('Pick a date and time');
    expect(pickerValue(trigger())).toBe('');
  });

  it('gives back the text it was given for a day and a time picked on it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await pickDateTime(userEvent.setup(), trigger(), '2027-12-31T23:59');

    expect(onChange).toHaveBeenLastCalledWith('2027-12-31T23:59');
    expect(pickerValue(trigger())).toBe('2027-12-31T23:59');
    expect(trigger()).toHaveTextContent('Dec 31, 2027, 23:59');
  });

  it('starts a day it picks at midnight, and keeps the time of a moment it already holds', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Choose the Year' }),
      '2027',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Choose the Month' }),
      '2',
    );
    await user.click(
      document.querySelector('button[data-day="2027-03-03"]') as HTMLElement,
    );

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T00:00');
    expect(timeField()).toHaveValue('00:00');

    await user.clear(timeField());
    await user.type(timeField(), '09:15');
    await user.click(
      document.querySelector('button[data-day="2027-03-20"]') as HTMLElement,
    );

    expect(onChange).toHaveBeenLastCalledWith('2027-03-20T09:15');
  });

  it('takes a time only once it is a time of day, and says so while it is not', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.type(timeField(), '25:61');

    expect(onChange).not.toHaveBeenCalled();
    expect(timeField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Use the format HH:mm/)).toBeInTheDocument();
    expect(pickerValue(trigger())).toBe('2027-03-03T10:00');

    await user.clear(timeField());
    await user.type(timeField(), '18:45');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T18:45');
    expect(timeField()).toHaveAttribute('aria-invalid', 'false');
  });

  it('goes back to the time it holds when the field is emptied and left', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.tab();

    expect(timeField()).toHaveValue('10:00');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['9:15', '09:15'],
    ['930', '09:30'],
    ['1430', '14:30'],
  ])('takes %s as the time %s once the field is left', async (typedTime, time) => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.type(timeField(), typedTime);

    expect(timeField()).toHaveAttribute('aria-invalid', 'false');

    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith(`2027-03-03T${time}`);
    expect(timeField()).toHaveValue(time);
    expect(pickerValue(trigger())).toBe(`2027-03-03T${time}`);
  });

  it('takes a time typed by hand when the calendar is closed with it', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.type(timeField(), '9:15');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T09:15');
    expect(trigger()).toHaveTextContent('Mar 3, 2027, 09:15');
  });

  it('does not drop a time that is none when the calendar closes: the form gets it to refuse', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.type(timeField(), '25:99');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T25:99');
    expect(pickerValue(trigger())).toBe('2027-03-03T25:99');
    expect(trigger()).toHaveTextContent('2027-03-03T25:99');
    expect(trigger()).toHaveAttribute('aria-invalid', 'true');

    await user.click(trigger());

    expect(timeField()).toHaveValue('25:99');
    expect(timeField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Use the format HH:mm/)).toBeInTheDocument();

    await user.clear(timeField());
    await user.type(timeField(), '18:45');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T18:45');
    expect(trigger()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('puts a time typed before any day on the day picked next, wrong or not', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await user.type(timeField(), '9:15');
    await user.click(
      document.querySelector('button[data-day]:not([data-outside])') as HTMLElement,
    );

    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/T09:15$|T9:15$/);
  });

  it('clears the value', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);

    await clearPicker(userEvent.setup(), trigger());

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(trigger()).toHaveTextContent('Pick a date and time');
  });

  it('keeps the clear button, disabled, while nothing is chosen, so the popover keeps its height', async () => {
    render(<Harness />);

    await userEvent.setup().click(trigger());

    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('shows a text that is not a moment as it is, marked invalid, and leaves it as it is', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-13-45T10:00" onChange={onChange} />);

    expect(trigger()).toHaveTextContent('2027-13-45T10:00');
    expect(trigger()).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens and closes from the keyboard, and reports that it was left', async () => {
    const onBlur = vi.fn();
    render(<Harness onBlur={onBlur} />);
    const user = userEvent.setup();

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', {
      name: 'Choose a date and time',
    });
    expect(within(dialog).getByRole('grid')).toBeInTheDocument();
    expect(onBlur).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onBlur).toHaveBeenCalled();
  });

  it('does not submit the form it sits in', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    );

    await userEvent.setup().click(trigger());

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes the calendar on Enter in the time field without submitting the form', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    const onBlur = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Harness initial="2027-03-03T10:00" onBlur={onBlur} />
      </form>,
    );
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.type(timeField(), '18:45{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
    expect(pickerValue(trigger())).toBe('2027-03-03T18:45');
  });

  it('keeps the calendar open on Enter in a time field that holds no time', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Harness initial="2027-03-03T10:00" />
      </form>,
    );
    const user = userEvent.setup();

    await user.click(trigger());
    await user.clear(timeField());
    await user.type(timeField(), '25:99{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(timeField()).toHaveAttribute('aria-invalid', 'true');
  });

  it('reads its value after its name, so a screen reader announces both', async () => {
    render(<Harness initial="2027-03-03T10:00" />);

    expect(trigger()).toHaveAccessibleName('Starts (UTC)');
    expect(trigger()).toHaveAccessibleDescription('Mar 3, 2027, 10:00');
  });

  it('reads the placeholder too while nothing is chosen', () => {
    render(<Harness />);

    expect(trigger()).toHaveAccessibleDescription('Pick a date and time');
  });

  it('keeps the description a form gives it, ahead of the value', () => {
    render(
      <>
        <p id="hint">Dates are in UTC.</p>
        <DateTimePicker
          aria-describedby="hint"
          aria-label="Ends"
          onChange={vi.fn()}
          value="2027-03-03T10:00"
        />
      </>,
    );

    expect(screen.getByLabelText('Ends')).toHaveAccessibleDescription(
      'Dates are in UTC. Mar 3, 2027, 10:00',
    );
  });

  it('opens with the focus on the chosen day, so the arrow keys work at once', async () => {
    render(<Harness initial="2027-03-05T10:00" />);

    await userEvent.setup().click(trigger());

    await waitFor(() =>
      expect(
        document.querySelector('button[data-day="2027-03-05"]'),
      ).toHaveFocus(),
    );
  });

  it('opens with the focus on today when no day is chosen', async () => {
    render(<Harness />);

    await userEvent.setup().click(trigger());

    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('[data-today="true"] button'),
      ),
    );
  });
  it('is not opened while it is disabled', async () => {
    render(
      <DateTimePicker disabled onChange={vi.fn()} value="2027-03-03T10:00" />,
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
});

// Zone-sensitive: the moment is shown, picked and counted from in UTC, so a zone
// that is not UTC is what tells the right code from one that uses local fields.
describe.each(TEST_ZONES)('DateTimePicker in $zone', ({ zone, utcMoment }) => {
  useTimeZone(zone, utcMoment);

  it('shows the moment it holds in UTC', () => {
    render(<Harness initial="2027-03-03T23:30" />);

    expect(trigger()).toHaveTextContent('Mar 3, 2027, 23:30');
    expect(pickerValue(trigger())).toBe('2027-03-03T23:30');
  });

  it.each(['2027-12-31T23:59', '2026-03-29T01:30', '2027-01-01T00:00'])(
    'gives back the moment %s it was asked to pick',
    async (value) => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);

      await pickDateTime(userEvent.setup(), trigger(), value);

      expect(onChange).toHaveBeenLastCalledWith(value);
      expect(pickerValue(trigger())).toBe(value);
    },
  );

  it('marks the UTC day as today, not the day of the zone of the browser', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(utcMoment));
    try {
      render(<Harness />);

      await userEvent.setup({ advanceTimers: () => {} }).click(trigger());

      const today = document.querySelector('[data-today="true"] button');
      expect(today).toHaveAttribute('data-day', TEST_ZONES_UTC_DAY);
    } finally {
      vi.useRealTimers();
    }
  });
});
