import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
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
  localTimeZone,
  onBlur,
  onChange,
}: {
  initial?: string;
  localTimeZone?: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <label htmlFor="starts" id="starts-label">
        Starts (UTC)
      </label>
      <DateTimePicker
        groupLabelledBy="starts-label"
        id="starts"
        localTimeZone={localTimeZone}
        onBlur={onBlur}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        value={value}
      />
      <button type="button">After</button>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Starts (UTC)' });
const hours = () => screen.getByRole('spinbutton', { name: 'Hours' });
const minutes = () => screen.getByRole('spinbutton', { name: 'Minutes' });
const timeGroup = () => screen.getByRole('group', { name: /^Time \(UTC\)/ });
const timeText = () => `${hoursText()}:${minutesText()}`;
const hoursText = () => (hours() as HTMLInputElement).value;
const minutesText = () => (minutes() as HTMLInputElement).value;
const leave = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'After' }));

// Sets the time the way a person does: a click on the hours, then its digits.
async function typeTime(
  user: ReturnType<typeof userEvent.setup>,
  time: string,
) {
  await user.click(hours());
  await user.keyboard(time.replace(':', ''));
}

describe('DateTimePicker', () => {
  // The wording below is that of a UTC clock, where no local time is shown: the
  // zones that show one are the ones further down.
  useTimeZone('UTC');

  it('is a date button named by its label and a time field, with a placeholder while nothing is chosen', () => {
    render(<Harness />);

    expect(trigger().tagName).toBe('BUTTON');
    expect(trigger()).toHaveTextContent('Pick a date');
    expect(pickerValue(trigger())).toBe('');
    expect(hours()).toHaveValue('');
    expect(minutes()).toHaveValue('');
  });

  it('wraps the pair in a group the label of the field names', () => {
    render(<Harness />);

    const group = screen.getByRole('group', { name: 'Starts (UTC)' });

    expect(group).toContainElement(trigger());
    expect(group).toContainElement(timeGroup());
  });

  it('is no group without a label to name it', () => {
    render(<DateTimePicker aria-label="Ends" onChange={vi.fn()} value="" />);

    expect(
      screen.queryByRole('group', { name: 'Ends' }),
    ).toBeNull();
  });

  it('gives back the text it was given for a day and a time picked on it', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await pickDateTime(userEvent.setup(), trigger(), '2027-12-31T23:59');

    expect(onChange).toHaveBeenLastCalledWith('2027-12-31T23:59');
    expect(pickerValue(trigger())).toBe('2027-12-31T23:59');
    expect(trigger()).toHaveTextContent('Dec 31, 2027');
    expect(timeText()).toBe('23:59');
  });

  it('keeps the calendar to the calendar, and closes it with the day picked', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(trigger());
    const dialog = await screen.findByRole('dialog', { name: 'Choose a date' });

    expect(within(dialog).getByRole('grid')).toBeInTheDocument();
    expect(within(dialog).queryByRole('spinbutton')).toBeNull();
    expect(within(dialog).queryByRole('textbox')).toBeNull();

    await user.click(
      document.querySelector(
        'button[data-day]:not([data-outside])',
      ) as HTMLElement,
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger()).toHaveFocus();
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
    expect(timeText()).toBe('00:00');

    await typeTime(user, '09:15');
    await user.click(trigger());
    await user.click(
      document.querySelector('button[data-day="2027-03-20"]') as HTMLElement,
    );

    expect(onChange).toHaveBeenLastCalledWith('2027-03-20T09:15');
  });

  it('takes a time as its two segments are filled, and the value keeps its format', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await typeTime(user, '18:45');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T18:45');
    expect(pickerValue(trigger())).toBe('2027-03-03T18:45');
  });

  it('steps the time with the arrow keys, wrapping, and gives each step back', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T23:59" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{ArrowUp}');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T23:00');

    await user.click(hours());
    await user.keyboard('{ArrowUp}');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T00:00');
  });

  it('picks the time from the columns of the clock', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Choose a time' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Hours' })).getByRole(
        'option',
        { name: '16' },
      ),
    );

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T16:00');
    expect(pickerValue(trigger())).toBe('2027-03-03T16:00');
  });

  it('does not take a time while a segment is empty, and says so once the field is left', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Backspace}');

    // Half filled, still in the field: nothing is written and nothing is said.
    expect(onChange).not.toHaveBeenCalled();
    expect(pickerValue(trigger())).toBe('2027-03-03T10:00');
    expect(screen.queryByText(/Enter a complete time/)).toBeNull();
    expect(hours()).not.toHaveAttribute('aria-invalid');

    await leave(user);

    // Left: the form is given what is there, to refuse it.
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith('2027-03-03T10:--'),
    );
    expect(pickerValue(trigger())).toBe('2027-03-03T10:--');
    expect(timeText()).toBe('10:');
    expect(minutes()).toHaveValue('');
    // Only the segment that is empty is wrong: the hours, 10, are fine.
    expect(hours()).not.toHaveAttribute('aria-invalid');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Enter a complete time/)).toBeInTheDocument();
    expect(timeGroup()).toHaveAccessibleDescription(
      /Enter a complete time/,
    );
    // The button still names the day.
    expect(trigger()).toHaveTextContent('Mar 3, 2027');
  });

  it('takes the hours typed alone as a time on a fresh day and on a field that was cleared alike', async () => {
    const user = userEvent.setup();

    const fresh = vi.fn();
    const { unmount } = render(
      <Harness initial="2027-03-03T00:00" onChange={fresh} />,
    );
    await typeTime(user, '10');
    await leave(user);
    expect(fresh).toHaveBeenLastCalledWith('2027-03-03T10:00');
    unmount();

    const cleared = vi.fn();
    render(<Harness initial="2027-03-03T00:00" onChange={cleared} />);
    await user.click(hours());
    await user.keyboard('{Backspace}');
    await user.click(minutes());
    await user.keyboard('{Backspace}');
    await typeTime(user, '10');
    await leave(user);

    expect(cleared).toHaveBeenLastCalledWith('2027-03-03T10:00');
    expect(timeText()).toBe('10:00');
    expect(screen.queryByText(/Enter a complete time/)).toBeNull();
    expect(minutes()).not.toHaveAttribute('aria-invalid');
  });

  it('takes the time again once it is completed', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:--" onChange={onChange} />);
    const user = userEvent.setup();

    expect(minutes()).toHaveValue('');
    expect(hours()).toHaveValue('10');

    await user.click(minutes());
    await user.keyboard('45');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T10:45');
    expect(screen.queryByText(/Enter a complete time/)).toBeNull();
    expect(hours()).not.toHaveAttribute('aria-invalid');
  });

  it('goes back to the time it holds when the field is emptied and left', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{Backspace}');
    await user.click(minutes());
    await user.keyboard('{Backspace}');

    expect(hours()).toHaveValue('');

    await leave(user);

    await waitFor(() => expect(timeText()).toBe('10:00'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts a time typed before any day on the day picked next', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    await typeTime(user, '09:15');

    await user.click(trigger());
    await user.click(
      document.querySelector(
        'button[data-day]:not([data-outside])',
      ) as HTMLElement,
    );

    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}T09:15$/);
  });

  describe('a time typed before any day', () => {
    it('is given to the form with no day, so that the form refuses the pair instead of reading no time', async () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const user = userEvent.setup();

      await typeTime(user, '09:30');

      // At once, while the field is still being typed in: a form that read an
      // empty value here would send the pair as no time at all.
      expect(onChange).toHaveBeenLastCalledWith('T09:30');
      expect(pickerValue(trigger())).toBe('T09:30');
      expect(timeText()).toBe('09:30');
    });

    it('says a day is missing, on the date button, which still reads as having none', async () => {
      render(<Harness />);
      const user = userEvent.setup();

      await typeTime(user, '09:30');

      expect(trigger()).toHaveTextContent('Pick a date');
      expect(trigger()).toHaveAttribute('aria-invalid', 'true');
      expect(
        screen.getByText('Choose a day as well as the time.'),
      ).toBeInTheDocument();
      expect(timeGroup()).toHaveAccessibleDescription(
        'Choose a day as well as the time.',
      );
    });

    it('leaves the message about the pair to the form when the form shows its own', () => {
      render(
        <>
          <p id="note">Enter a valid date and time</p>
          <DateTimePicker
            aria-describedby="note"
            aria-invalid
            aria-label="Ends"
            localTimeZone="UTC"
            onChange={vi.fn()}
            value="T09:30"
          />
        </>,
      );

      expect(screen.queryByText(/Choose a day as well/)).toBeNull();
      expect(timeGroup()).toHaveAccessibleDescription('Enter a valid date and time');
      expect(hours()).toHaveValue('09');
      expect(minutes()).toHaveValue('30');
    });

    it('is given as half filled, for the form to refuse, once the field is left', async () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const user = userEvent.setup();

      await user.click(hours());
      await user.keyboard('09');
      await user.click(minutes());
      await user.keyboard('{Backspace}');
      await leave(user);

      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('T09:--'));
    });

    it('is dropped from the form when the time is emptied, since nothing is left', async () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const user = userEvent.setup();

      await typeTime(user, '09:30');
      await user.click(hours());
      await user.keyboard('{Backspace}');
      await user.click(minutes());
      await user.keyboard('{Backspace}');
      await leave(user);

      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''));
      expect(pickerValue(trigger())).toBe('');
      expect(hours()).toHaveValue('');
      expect(screen.queryByText(/Choose a day as well/)).toBeNull();
    });

    it('is cleared with the clear button of the calendar, with the time', async () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      const user = userEvent.setup();

      await typeTime(user, '09:30');
      await clearPicker(user, trigger());

      expect(onChange).toHaveBeenLastCalledWith('');
      expect(hours()).toHaveValue('');
      expect(minutes()).toHaveValue('');
    });

    it('is shown again when a form hands the pair in, and is kept by the day picked next', async () => {
      const onChange = vi.fn();
      render(<Harness initial="T09:30" onChange={onChange} />);

      expect(trigger()).toHaveTextContent('Pick a date');
      expect(hours()).toHaveValue('09');
      expect(minutes()).toHaveValue('30');

      const user = userEvent.setup();
      await user.click(trigger());
      await user.click(
        document.querySelector(
          'button[data-day]:not([data-outside])',
        ) as HTMLElement,
      );

      expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/T09:30$/);
    });
  });

  it('puts a half-filled time typed before any day on the day picked next, as it is, for the form to refuse', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('09');
    await user.click(minutes());
    await user.keyboard('{Backspace}');
    await leave(user);
    await user.click(trigger());
    await user.click(
      document.querySelector(
        'button[data-day]:not([data-outside])',
      ) as HTMLElement,
    );

    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/T09:--$/);
  });

  it('clears the value', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);

    await clearPicker(userEvent.setup(), trigger());

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(trigger()).toHaveTextContent('Pick a date');
    expect(hours()).toHaveValue('');
    expect(minutes()).toHaveValue('');
  });

  it('stays cleared when it is cleared with a time half typed', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Backspace}');
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(pickerValue(trigger())).toBe('');
    expect(trigger()).toHaveTextContent('Pick a date');
    expect(hours()).toHaveValue('');
  });

  it('keeps the clear button, disabled, while nothing is chosen, so the calendar keeps its height', async () => {
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

  it('shows a time that is none as it is, next to the day it follows', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-03T25:99" onChange={onChange} />);

    expect(trigger()).toHaveTextContent('Mar 3, 2027');
    expect(hours()).toHaveValue('25');
    expect(minutes()).toHaveValue('99');
    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Enter a time from 00:00 to 23:59.'),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await typeTime(user, '18:45');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T18:45');
    expect(hours()).not.toHaveAttribute('aria-invalid');
  });

  describe.each(['24:00', '12:60', '25:99', '25:00'])(
    'a time that does not exist, %s',
    (time) => {
      it('is given to the form as it was typed, never as another time, and is said', async () => {
        const onChange = vi.fn();
        render(<Harness initial="2027-03-03T10:00" onChange={onChange} />);
        const user = userEvent.setup();

        await typeTime(user, time);

        // At once, while the field is still being typed in: the form never holds
        // the time it had while the field shows another.
        expect(onChange).toHaveBeenLastCalledWith(`2027-03-03T${time}`);
        expect(timeText()).toBe(time);
        expect(pickerValue(trigger())).toBe(`2027-03-03T${time}`);
        expect(
          screen.getByText('Enter a time from 00:00 to 23:59.'),
        ).toBeInTheDocument();
        expect(timeGroup()).toHaveAccessibleDescription(
          'Enter a time from 00:00 to 23:59.',
        );
      });

      it('stays as it is when the field is left, for the form to refuse', async () => {
        render(<Harness initial="2027-03-03T10:00" />);
        const user = userEvent.setup();

        await typeTime(user, time);
        await leave(user);

        await waitFor(() =>
          expect(pickerValue(trigger())).toBe(`2027-03-03T${time}`),
        );
        expect(timeText()).toBe(time);
      });
    },
  );

  it('hands the state and the description of a form to the time field as well as to the date button', () => {
    render(
      <>
        <p id="note">Must be in the future.</p>
        <DateTimePicker
          aria-describedby="note"
          aria-invalid
          aria-label="Ends"
          onChange={vi.fn()}
          localTimeZone="UTC"
          value="2020-03-03T10:00"
        />
      </>,
    );

    expect(timeGroup()).toHaveAccessibleDescription('Must be in the future.');
    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Ends')).toHaveAttribute('aria-invalid', 'true');
  });

  it('leaves the message about a half-filled time to the form when the form shows its own', () => {
    render(
      <>
        <p id="note">Enter a valid date and time</p>
        <DateTimePicker
          aria-describedby="note"
          aria-invalid
          aria-label="Ends"
          onChange={vi.fn()}
          localTimeZone="UTC"
          value="2027-03-03T10:--"
        />
      </>,
    );

    expect(screen.queryByText(/Enter a complete time/)).toBeNull();
    expect(timeGroup()).toHaveAccessibleDescription('Enter a valid date and time');
    expect(hours()).not.toHaveAttribute('aria-invalid');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
  });

  it('opens and closes the calendar from the keyboard', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', {
      name: 'Choose a date',
    });
    expect(within(dialog).getByRole('grid')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger()).toHaveFocus();
  });

  it('reports that it was left once the focus is out of the pair, not as it moves inside it', async () => {
    const onBlur = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onBlur={onBlur} />);
    const user = userEvent.setup();

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.tab();
    expect(hours()).toHaveFocus();
    await user.tab();
    expect(minutes()).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Choose a time' })).toHaveFocus();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onBlur).not.toHaveBeenCalled();

    await user.tab();

    await waitFor(() => expect(onBlur).toHaveBeenCalledTimes(1));
  });

  it('does not report that it was left while its calendar or its columns hold the focus', async () => {
    const onBlur = vi.fn();
    render(<Harness initial="2027-03-03T10:00" onBlur={onBlur} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await screen.findByRole('dialog', { name: 'Choose a date' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Choose a time' }));
    await screen.findByRole('dialog', { name: 'Choose a time' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onBlur).not.toHaveBeenCalled();
  });

  it('reports that it was left when the calendar is dismissed by a click elsewhere', async () => {
    const onBlur = vi.fn();
    render(<Harness onBlur={onBlur} />);
    const user = userEvent.setup();

    await user.click(trigger());
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'After' }));

    await waitFor(() => expect(onBlur).toHaveBeenCalledTimes(1));
  });

  it('settles a half-filled time before it reports that it was left', async () => {
    const order: string[] = [];
    render(
      <Harness
        initial="2027-03-03T10:00"
        onBlur={() => order.push('blur')}
        onChange={(value) => order.push(value)}
      />,
    );
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Backspace}');
    await leave(user);

    await waitFor(() => expect(order).toContain('blur'));
    expect(order).toEqual(['2027-03-03T10:--', 'blur']);
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
    const user = userEvent.setup();

    await user.click(trigger());
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('gives the form a half-filled time on Enter, and does not send the form', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    const onChange = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Harness initial="2027-03-03T10:00" onChange={onChange} />
        <button type="submit">Send</button>
      </form>,
    );
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Backspace}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-03T10:--');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reads its value after its name, so a screen reader announces both', async () => {
    render(<Harness initial="2027-03-03T10:00" />);

    expect(trigger()).toHaveAccessibleName('Starts (UTC)');
    expect(trigger()).toHaveAccessibleDescription('Mar 3, 2027');
  });

  it('reads the placeholder too while nothing is chosen', () => {
    render(<Harness />);

    expect(trigger()).toHaveAccessibleDescription('Pick a date');
  });

  it('names the time field for what it holds', () => {
    render(<Harness initial="2027-03-03T10:00" />);

    expect(timeGroup()).toHaveAccessibleName('Time (UTC)');
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
      'Dates are in UTC. Mar 3, 2027',
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

  it('is not opened, and its time not edited, while it is disabled', () => {
    render(
      <DateTimePicker disabled onChange={vi.fn()} value="2027-03-03T10:00" />,
    );

    expect(screen.getAllByRole('button')[0]).toBeDisabled();
    expect(hours()).toBeDisabled();
    expect(minutes()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose a time' })).toBeDisabled();
  });
});

// Zone-sensitive: the moment is shown, picked and counted from in UTC, so a zone
// that is not UTC is what tells the right code from one that uses local fields.
describe.each(TEST_ZONES)('DateTimePicker in $zone', ({ zone, utcMoment }) => {
  useTimeZone(zone, utcMoment);

  it('shows the moment it holds in UTC', () => {
    render(<Harness initial="2027-03-03T23:30" />);

    expect(trigger()).toHaveTextContent('Mar 3, 2027');
    expect(timeText()).toBe('23:30');
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

const localHint = () =>
  document.querySelector<HTMLElement>('[data-slot="date-picker-local-time"]');
const LOCAL_TIME_LABEL = 'Time (UTC), your local time is shown below';
const localTimeGroup = () => screen.getByRole('group', { name: LOCAL_TIME_LABEL });

// The moment is UTC and the person's clock is not: the picker says what it is on
// that clock, under the pair, and never changes what it holds.
describe.each([
  {
    zone: 'Europe/Paris',
    // The voucher that was to start at 16:21 in Paris, written as 16:21 UTC.
    utc: '2026-10-18T14:21',
    local: '= 16:21 in Paris (CEST)',
  },
  {
    zone: 'Pacific/Kiritimati',
    utc: '2026-10-07T23:30',
    local: '= Oct 8, 13:30 in Kiritimati (GMT+14)',
  },
  {
    zone: 'America/Los_Angeles',
    utc: '2026-10-07T03:30',
    local: '= Oct 6, 20:30 in Los Angeles (PDT)',
  },
])('DateTimePicker local time in $zone', ({ zone, utc, local }) => {
  useTimeZone(zone);

  it('says the moment on the clock of the browser under the pair', () => {
    render(<Harness initial={utc} />);

    expect(localHint()).toHaveTextContent(local);
    // Under the row that holds the button and the field, not inside it.
    const pair = screen.getByRole('group', { name: 'Starts (UTC)' });
    expect(pair).toContainElement(localHint());
    expect(trigger().closest('div.flex')).not.toContainElement(localHint());
    // The button still says the day in UTC, and the picker holds the UTC text.
    expect(trigger()).toHaveTextContent(/^\w{3} \d{1,2}, 2026$/);
    expect(pickerValue(trigger())).toBe(utc);
  });

  it('puts the line in the description of the time field, which its label announces', () => {
    render(<Harness initial={utc} />);

    expect(localTimeGroup()).toBe(timeGroup());
    expect(localTimeGroup()).toHaveAccessibleDescription(local);
    expect(screen.queryByRole('group', { name: 'Time (UTC)' })).toBeNull();
  });

  it('does not put the line in the description of the date button', () => {
    render(<Harness initial={utc} />);

    expect(trigger()).toHaveAccessibleDescription(
      expect.not.stringContaining('= '),
    );
  });

  it('announces the line politely, as the time changes it', () => {
    render(<Harness initial={utc} />);

    expect(localHint()).toHaveAttribute('aria-live', 'polite');
  });

  it('follows the time as it is typed, and gives back the UTC text', async () => {
    const onChange = vi.fn();
    render(<Harness initial={utc} onChange={onChange} />);
    const user = userEvent.setup();
    const [day] = utc.split('T');

    await typeTime(user, '12:00');

    expect(onChange).toHaveBeenLastCalledWith(`${day}T12:00`);
    expect(localHint()?.textContent).toMatch(/^= .* in /);
    expect(localHint()).not.toHaveTextContent(local);
    expect(pickerValue(trigger())).toBe(`${day}T12:00`);
  });

  it('empties the line, not its place, while the time is half filled', async () => {
    render(<Harness initial={utc} />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Backspace}');
    await leave(user);

    await waitFor(() => expect(localHint()).toBeEmptyDOMElement());
    expect(screen.getByText(/Enter a complete time/)).toBeInTheDocument();
  });

  it('says nothing while no moment is chosen, and does not promise a line that is not there', () => {
    render(<Harness />);

    expect(localHint()).toBeEmptyDOMElement();
    expect(timeGroup()).toHaveAccessibleName('Time (UTC)');
    expect(screen.queryByRole('group', { name: LOCAL_TIME_LABEL })).toBeNull();
    expect(trigger()).toHaveAccessibleDescription('Pick a date');
  });

  it('names the time for what it holds once the line is empty because it is half filled', async () => {
    render(<Harness initial={utc} />);
    const user = userEvent.setup();

    expect(timeGroup()).toHaveAccessibleName(LOCAL_TIME_LABEL);

    await user.click(minutes());
    await user.keyboard('{Backspace}');
    await leave(user);

    await waitFor(() => expect(localHint()).toBeEmptyDOMElement());
    expect(timeGroup()).toHaveAccessibleName('Time (UTC)');
  });

  it('says nothing of a text that is not a moment', () => {
    render(<Harness initial="2027-13-45T10:00" />);

    expect(localHint()).toBeEmptyDOMElement();
  });

  it('keeps the description a form gives it, ahead of the value, and puts the line on the time field', () => {
    render(
      <>
        <p id="hint">Dates are in UTC.</p>
        <DateTimePicker
          aria-describedby="hint"
          aria-label="Ends"
          onChange={vi.fn()}
          value={utc}
        />
      </>,
    );

    expect(screen.getByLabelText('Ends')).toHaveAccessibleDescription(
      expect.stringMatching(/^Dates are in UTC\. \w{3} \d{1,2}, 2026$/),
    );
    // The time field has the description of the form too, then the line.
    expect(localTimeGroup().getAttribute('aria-describedby')).toBe(
      `hint ${localHint()?.id}`,
    );
  });

  it('does not touch what the pick gives back', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await pickDateTime(userEvent.setup(), trigger(), utc);

    expect(onChange).toHaveBeenLastCalledWith(utc);
  });
});

describe('DateTimePicker local time in UTC', () => {
  useTimeZone('UTC');

  it('shows nothing of a local time: the moment is already on that clock', () => {
    render(<Harness initial="2026-10-18T14:21" />);

    expect(localHint()).toBeNull();
    expect(trigger()).toHaveAccessibleDescription('Oct 18, 2026');
    expect(timeGroup()).toHaveAccessibleName('Time (UTC)');
    expect(timeGroup()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('group', { name: LOCAL_TIME_LABEL })).toBeNull();
  });

  it('shows the local time of a zone it is given, whatever the clock of the machine', () => {
    render(
      <Harness initial="2026-10-18T14:21" localTimeZone="Europe/Paris" />,
    );

    expect(localHint()).toHaveTextContent('= 16:21 in Paris (CEST)');
  });
});

describe('DateTimePicker local time in French', () => {
  useTimeZone('Europe/Paris');

  beforeAll(async () => {
    testI18n.addResourceBundle('fr', 'translation', fr, true, true);
    await testI18n.changeLanguage('fr');
  });

  afterAll(async () => {
    await testI18n.changeLanguage('en');
    testI18n.removeResourceBundle('fr', 'translation');
  });

  it('words the local time and the label of the time field in French', () => {
    render(<Harness initial="2026-10-18T14:21" />);

    expect(localHint()).toHaveTextContent('= 16:21 à Paris (CEST)');
    expect(
      screen.getByRole('group', {
        name: 'Heure (UTC), votre heure locale est affichée ci-dessous',
      }),
    ).toBeInTheDocument();
  });

  it('adds the day in French when it is not the UTC day', () => {
    render(<Harness initial="2026-10-18T23:30" />);

    expect(localHint()).toHaveTextContent('= 19 oct., 01:30 à Paris (CEST)');
  });

  it('words the segments, the clock and the placeholder in French', () => {
    render(<Harness />);

    expect(screen.getByRole('spinbutton', { name: 'Heures' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir une heure' })).toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Choisir une date');
  });
});
