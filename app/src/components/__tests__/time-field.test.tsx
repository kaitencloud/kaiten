import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import { TimeField } from '../time-field';

beforeAll(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
});

afterAll(() => {
  testI18n.removeResourceBundle('en', 'translation');
});

function Harness({
  initial = '',
  onChange,
  onSettle,
  invalid,
  disabled,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  onSettle?: () => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <TimeField
        aria-invalid={invalid}
        aria-label="Time (UTC)"
        disabled={disabled}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        onSettle={onSettle}
        value={value}
      />
      <output data-testid="value">{value}</output>
      <button type="button">After</button>
    </>
  );
}

const hours = () => screen.getByRole('spinbutton', { name: 'Hours' });
const minutes = () => screen.getByRole('spinbutton', { name: 'Minutes' });
const held = () => screen.getByTestId('value').textContent;
const clock = () => screen.getByRole('button', { name: 'Choose a time' });
const hoursColumn = () => screen.getByRole('listbox', { name: 'Hours' });
const minutesColumn = () => screen.getByRole('listbox', { name: 'Minutes' });

describe('TimeField segments', () => {
  it('is a group of two spin buttons, hours and minutes, with a clock button', () => {
    render(<Harness initial="09:30" />);

    expect(screen.getByRole('group', { name: 'Time (UTC)' })).toBeInTheDocument();
    expect(hours()).toHaveValue('09');
    expect(minutes()).toHaveValue('30');
    expect(clock()).toBeInTheDocument();
  });

  it('gives each segment the attributes of a spin button', () => {
    render(<Harness initial="09:30" />);

    expect(hours()).toHaveAttribute('role', 'spinbutton');
    expect(hours()).toHaveAttribute('aria-valuenow', '9');
    expect(hours()).toHaveAttribute('aria-valuemin', '0');
    expect(hours()).toHaveAttribute('aria-valuemax', '23');
    expect(hours()).toHaveAttribute('aria-valuetext', '09');
    expect(minutes()).toHaveAttribute('aria-valuenow', '30');
    expect(minutes()).toHaveAttribute('aria-valuemax', '59');
    expect(minutes()).toHaveAttribute('aria-valuetext', '30');
  });

  it('shows -- and says so while a segment is empty', () => {
    render(<Harness />);

    expect(hours()).toHaveAttribute('placeholder', '--');
    expect(hours()).toHaveValue('');
    expect(hours()).not.toHaveAttribute('aria-valuenow');
    expect(hours()).toHaveAttribute('aria-valuetext', 'Empty');
    expect(minutes()).toHaveAttribute('placeholder', '--');
  });

  it('is always on the 24-hour clock', () => {
    render(<Harness initial="18:05" />);

    expect(hours()).toHaveValue('18');
    expect(screen.queryByText(/am|pm/i)).toBeNull();
  });

  it('names its segments in French', async () => {
    testI18n.addResourceBundle('fr', 'translation', fr, true, true);
    await testI18n.changeLanguage('fr');
    try {
      render(<Harness initial="09:30" />);

      expect(screen.getByRole('spinbutton', { name: 'Heures' })).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: 'Minutes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choisir une heure' })).toBeInTheDocument();
    } finally {
      await testI18n.changeLanguage('en');
      testI18n.removeResourceBundle('fr', 'translation');
    }
  });

  it('steps with the arrow keys and wraps without carrying', async () => {
    render(<Harness initial="23:59" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{ArrowUp}');
    expect(held()).toBe('00:59');
    await user.keyboard('{ArrowDown}');
    expect(held()).toBe('23:59');

    await user.click(minutes());
    await user.keyboard('{ArrowUp}');
    expect(held()).toBe('23:00');
    await user.keyboard('{ArrowDown}');
    expect(held()).toBe('23:59');
  });

  it('steps by six hours and ten minutes with Page Up and Page Down', async () => {
    render(<Harness initial="20:05" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{PageUp}');
    expect(held()).toBe('02:05');
    await user.keyboard('{PageDown}');
    expect(held()).toBe('20:05');

    await user.click(minutes());
    await user.keyboard('{PageDown}');
    expect(held()).toBe('20:55');
    await user.keyboard('{PageUp}');
    expect(held()).toBe('20:05');
  });

  it('goes to the first and the last value with Home and End', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{End}');
    expect(held()).toBe('23:30');
    await user.keyboard('{Home}');
    expect(held()).toBe('00:30');

    await user.click(minutes());
    await user.keyboard('{End}');
    expect(held()).toBe('00:59');
    await user.keyboard('{Home}');
    expect(held()).toBe('00:00');
  });

  it('starts an empty segment on the first value going up and the last going down', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{ArrowUp}');
    expect(held()).toBe('00:--');

    await user.click(minutes());
    await user.keyboard('{ArrowDown}');
    expect(held()).toBe('00:59');
  });

  it('fills the hours with two digits and moves on to the minutes', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('16');

    expect(hours()).toHaveValue('16');
    expect(minutes()).toHaveFocus();

    await user.keyboard('45');

    expect(held()).toBe('16:45');
  });

  it('waits for a second digit after a 1, and moves on at once after a 3', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('1');

    expect(held()).toBe('01:--');
    expect(hours()).toHaveFocus();

    await user.click(minutes());
    await user.click(hours());
    await user.keyboard('3');

    expect(held()).toBe('03:--');
    expect(minutes()).toHaveFocus();
  });

  it('keeps the pair as it was typed when it is out of range, as the 25 of 25 hours, and marks it invalid', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('25');

    // Not 02 with the 5 dropped: the person sees what they typed, out of range.
    expect(hours()).toHaveValue('25');
    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(minutes()).toHaveFocus();
    expect(held()).toBe('25:--');

    await user.keyboard('99');

    expect(held()).toBe('25:99');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['2400', '24:00'],
    ['2500', '25:00'],
    ['1260', '12:60'],
    ['2599', '25:99'],
  ])('holds %s as it was typed, never as another time', async (digits, shown) => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard(digits);

    expect(held()).toBe(shown);
  });

  it('keeps 60 minutes as 60, which is out of range, not as 06 and then 00', async () => {
    render(<Harness initial="10:--" />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('60');

    expect(held()).toBe('10:60');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
  });

  it('starts a new entry once an entry is over, so a digit after 59 is the first of another', async () => {
    render(<Harness initial="10:--" />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('593');

    expect(held()).toBe('10:03');
  });

  it('calls onChange at each digit, with the time as the field shows it', async () => {
    const onChange = vi.fn();
    render(<Harness initial="09:30" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('16');

    // After the 1 the field shows 01, which is a time: it is given at once, as
    // the time input of a browser fires `input` at each digit.
    expect(onChange.mock.calls).toEqual([['01:30'], ['16:30']]);
  });

  it('takes minutes from 0 to 59 and moves on after a 6 or more', async () => {
    render(<Harness initial="10:--" />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('7');

    expect(held()).toBe('10:07');

    // A new entry, since the focus left the segment and came back.
    await user.click(hours());
    await user.click(minutes());
    await user.keyboard('59');

    expect(held()).toBe('10:59');
  });

  it('empties a segment with Backspace, and keeps the other', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{Backspace}');

    expect(held()).toBe('--:30');
    expect(hours()).toHaveValue('');

    await user.click(minutes());
    await user.keyboard('{Backspace}');

    expect(held()).toBe('');
  });

  it('goes to the minutes on a colon and on Right, and back on Left', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard(':');
    expect(minutes()).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(hours()).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(minutes()).toHaveFocus();
    expect(held()).toBe('10:30');
  });

  it('takes no letter and no sign', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('ab-+.');

    expect(held()).toBe('10:30');
    expect(hours()).toHaveValue('10');
  });

  it('takes what a soft keyboard types, which has no key to read', async () => {
    render(<Harness />);

    fireEvent.change(hours(), { target: { value: '1' } });
    fireEvent.change(hours(), { target: { value: '016' } });

    expect(held()).toBe('16:--');

    fireEvent.change(hours(), { target: { value: '' } });

    expect(held()).toBe('');
  });

  it('drops a pasted text, which is no digit typed', () => {
    const onChange = vi.fn();
    render(<Harness initial="09:30" onChange={onChange} />);

    fireEvent.change(hours(), { target: { value: '0916:45' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(held()).toBe('09:30');
  });

  it('shows a segment that is out of range as it is, marked invalid, and steps it from the start', async () => {
    render(<Harness initial="25:30" />);

    expect(hours()).toHaveValue('25');
    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(hours()).not.toHaveAttribute('aria-valuenow');
    expect(minutes()).not.toHaveAttribute('aria-invalid');

    await userEvent.setup().click(hours());
    await userEvent.setup().keyboard('{ArrowUp}');

    expect(held()).toBe('00:30');
  });

  it('marks only the segments that are empty when the caller refuses a half-filled time', () => {
    render(<Harness initial="09:--" invalid />);

    expect(hours()).not.toHaveAttribute('aria-invalid');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks only the segment that is out of range', () => {
    render(<Harness initial="25:30" invalid />);

    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(minutes()).not.toHaveAttribute('aria-invalid');
  });

  it('marks both segments when the caller refuses a time that is whole', () => {
    render(<Harness initial="09:30" invalid />);

    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks both segments of an empty field the caller refuses', () => {
    render(<Harness invalid />);

    expect(hours()).toHaveAttribute('aria-invalid', 'true');
    expect(minutes()).toHaveAttribute('aria-invalid', 'true');
  });

  it('puts the focus on the nearest segment when the box is pressed outside them', () => {
    render(<Harness initial="09:30" />);
    const box = screen.getByRole('group', { name: 'Time (UTC)' });

    // jsdom has no layout: the colon sits at 0, so the left of it is hours.
    fireEvent.mouseDown(box, { clientX: -10 });

    expect(hours()).toHaveFocus();

    fireEvent.mouseDown(box, { clientX: 40 });

    expect(minutes()).toHaveFocus();
  });

  it('is not editable while it is disabled', () => {
    render(<Harness disabled initial="09:30" />);

    expect(hours()).toBeDisabled();
    expect(minutes()).toBeDisabled();
    expect(clock()).toBeDisabled();
  });
});

describe('TimeField settling', () => {
  it('settles once, as the focus leaves the field, not between its parts', async () => {
    const onSettle = vi.fn();
    render(<Harness initial="10:30" onSettle={onSettle} />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.tab();
    await user.tab();

    expect(clock()).toHaveFocus();
    expect(onSettle).not.toHaveBeenCalled();

    await user.tab();

    await waitFor(() => expect(onSettle).toHaveBeenCalledTimes(1));
  });

  it('does not settle as the columns open and take the focus', async () => {
    const onSettle = vi.fn();
    render(<Harness initial="10:30" onSettle={onSettle} />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await screen.findByRole('dialog', { name: 'Choose a time' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onSettle).not.toHaveBeenCalled();
  });

  it('settles on Enter, which ends the time and does not send the form', async () => {
    const onSettle = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <Harness initial="10:30" onSettle={onSettle} />
        <button type="submit">Send</button>
      </form>,
    );
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{Enter}');

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('TimeField columns', () => {
  it('opens from the clock, on two columns with the hours from 00 to 23 and the minutes from 00 to 59', async () => {
    render(<Harness initial="10:30" />);

    await userEvent.setup().click(clock());

    const dialog = await screen.findByRole('dialog', { name: 'Choose a time' });
    expect(within(hoursColumn()).getAllByRole('option')).toHaveLength(24);
    expect(within(minutesColumn()).getAllByRole('option')).toHaveLength(60);
    expect(within(dialog).getAllByRole('option')[0]).toHaveTextContent('00');
    expect(within(hoursColumn()).getAllByRole('option').at(-1)).toHaveTextContent('23');
    expect(within(minutesColumn()).getAllByRole('option').at(-1)).toHaveTextContent('59');
  });

  it('marks the value of the field as the selected option of each column', async () => {
    render(<Harness initial="10:30" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    expect(
      within(hoursColumn()).getByRole('option', { selected: true }),
    ).toHaveTextContent('10');
    expect(
      within(minutesColumn()).getByRole('option', { selected: true }),
    ).toHaveTextContent('30');
    expect(hoursColumn()).toHaveAttribute(
      'aria-activedescendant',
      within(hoursColumn()).getByRole('option', { selected: true }).id,
    );
  });

  it('selects nothing while the segments are empty', async () => {
    render(<Harness />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    expect(
      within(hoursColumn()).queryByRole('option', { selected: true }),
    ).toBeNull();
    expect(hoursColumn()).not.toHaveAttribute('aria-activedescendant');
  });

  it('opens on the column of the segment, from the keyboard, with Alt+Down', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await screen.findByRole('dialog', { name: 'Choose a time' });
    await waitFor(() => expect(minutesColumn()).toHaveFocus());
    expect(held()).toBe('10:30');
  });

  it('opens on the hours when the clock is clicked first', async () => {
    render(<Harness initial="10:30" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
  });

  it('is a listbox per column, named for what it holds', async () => {
    render(<Harness initial="10:30" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    expect(hoursColumn()).toHaveAttribute('role', 'listbox');
    expect(minutesColumn()).toHaveAttribute('role', 'listbox');
  });

  it('moves the value with the arrow keys, and updates the field at once', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{ArrowDown}');

    expect(held()).toBe('11:30');
    expect(hours()).toHaveValue('11');

    await user.keyboard('{ArrowUp}{ArrowUp}');

    expect(held()).toBe('09:30');
  });

  it('wraps from 23 to 00 and back', async () => {
    render(<Harness initial="23:00" />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(held()).toBe('00:00');
    await user.keyboard('{ArrowUp}');
    expect(held()).toBe('23:00');
  });

  it('goes to the first and last value with Home and End, and by a page with Page Up and Down', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{End}');
    expect(held()).toBe('23:30');
    await user.keyboard('{Home}');
    expect(held()).toBe('00:30');
    await user.keyboard('{PageDown}');
    expect(held()).toBe('06:30');
    await user.keyboard('{PageUp}');
    expect(held()).toBe('00:30');
  });

  it('goes to the other column with Left and Right', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{ArrowRight}');

    expect(minutesColumn()).toHaveFocus();

    await user.keyboard('{ArrowDown}');

    expect(held()).toBe('10:31');

    await user.keyboard('{ArrowLeft}');

    expect(hoursColumn()).toHaveFocus();
  });

  it('selects the option that is clicked, and stays open for the other column', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await screen.findByRole('dialog');
    await user.click(
      within(hoursColumn()).getByRole('option', { name: '16' }),
    );

    expect(held()).toBe('16:30');
    expect(
      within(hoursColumn()).getByRole('option', { name: '16' }),
    ).toHaveAttribute('aria-selected', 'true');

    await user.click(
      within(minutesColumn()).getByRole('option', { name: '45' }),
    );

    expect(held()).toBe('16:45');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('starts the other segment from the click when it was empty', async () => {
    render(<Harness />);
    const user = userEvent.setup();

    await user.click(clock());
    await screen.findByRole('dialog');
    await user.click(within(hoursColumn()).getByRole('option', { name: '07' }));

    expect(held()).toBe('07:--');
  });

  it('moves by one with the chevrons above and below each column', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Next hour' }));
    expect(held()).toBe('11:30');
    await user.click(screen.getByRole('button', { name: 'Previous hour' }));
    await user.click(screen.getByRole('button', { name: 'Previous hour' }));
    expect(held()).toBe('09:30');
    await user.click(screen.getByRole('button', { name: 'Next minute' }));
    expect(held()).toBe('09:31');
    await user.click(screen.getByRole('button', { name: 'Previous minute' }));
    await user.click(screen.getByRole('button', { name: 'Previous minute' }));
    expect(held()).toBe('09:29');
  });

  it('keeps the focus in the column when a chevron or an option is clicked', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Next hour' }));
    await user.click(
      within(hoursColumn()).getByRole('option', { name: '14' }),
    );

    expect(hoursColumn()).toHaveFocus();
  });

  it('closes on Escape and returns the focus to the segment it came from', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(minutes());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await waitFor(() => expect(minutesColumn()).toHaveFocus());
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(minutes()).toHaveFocus();
    expect(held()).toBe('10:30');
  });

  it('closes on Enter, keeps the value it chose and returns the focus to the segment', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(hours());
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hours()).toHaveFocus();
    expect(held()).toBe('11:30');
  });

  it('does not settle when the columns close with the focus back on the field', async () => {
    const onSettle = vi.fn();
    render(<Harness initial="10:30" onSettle={onSettle} />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onSettle).not.toHaveBeenCalled();
  });

  it('does not open while it is disabled', () => {
    render(<Harness disabled initial="10:30" />);

    expect(clock()).toBeDisabled();
  });
});

describe('TimeField columns without blank space', () => {
  // A row is 28px and seven are in view, so the hours (24 rows) scroll by at
  // most 17 rows and the minutes (60 rows) by at most 53.
  const ROW = 28;
  const HOURS_END = 17 * ROW;
  const MINUTES_END = 53 * ROW;

  it('holds nothing but the options of its values, no spacer and no padding', async () => {
    render(<Harness initial="00:00" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    for (const [column, count] of [
      [hoursColumn(), 24],
      [minutesColumn(), 60],
    ] as const) {
      expect(column.children).toHaveLength(count);
      for (const child of Array.from(column.children)) {
        expect(child).toHaveAttribute('role', 'option');
        expect(child).not.toBeEmptyDOMElement();
      }
      expect(column.style.paddingTop).toBe('');
      expect(column.style.paddingBottom).toBe('');
    }
  });

  it('opens 00 on the first row', async () => {
    render(<Harness initial="00:00" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    expect(hoursColumn().scrollTop).toBe(0);
    expect(minutesColumn().scrollTop).toBe(0);
  });

  it('opens 23 and 59 on the last row, not further', async () => {
    render(<Harness initial="23:59" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    expect(hoursColumn().scrollTop).toBe(HOURS_END);
    expect(minutesColumn().scrollTop).toBe(MINUTES_END);
  });

  it('centres a value that has room on both sides', async () => {
    render(<Harness initial="12:30" />);

    await userEvent.setup().click(clock());

    await screen.findByRole('dialog');
    expect(hoursColumn().scrollTop).toBe(9 * ROW);
    expect(minutesColumn().scrollTop).toBe(27 * ROW);
  });

  it('keeps the selection in view after a chevron at each end, wrapping included', async () => {
    render(<Harness initial="23:59" />);
    const user = userEvent.setup();

    await user.click(clock());
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Next hour' }));
    expect(held()).toBe('00:59');
    expect(hoursColumn().scrollTop).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Previous hour' }));
    expect(held()).toBe('23:59');
    expect(hoursColumn().scrollTop).toBe(HOURS_END);

    await user.click(screen.getByRole('button', { name: 'Next minute' }));
    expect(held()).toBe('23:00');
    expect(minutesColumn().scrollTop).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Previous minute' }));
    expect(held()).toBe('23:59');
    expect(minutesColumn().scrollTop).toBe(MINUTES_END);
  });

  it('follows the selection down to the end and back up to the start with Home and End', async () => {
    render(<Harness initial="10:30" />);
    const user = userEvent.setup();

    await user.click(clock());
    await waitFor(() => expect(hoursColumn()).toHaveFocus());
    await user.keyboard('{End}');
    expect(hoursColumn().scrollTop).toBe(HOURS_END);
    await user.keyboard('{Home}');
    expect(hoursColumn().scrollTop).toBe(0);
  });
});
