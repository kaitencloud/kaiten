import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  clearPicker,
  pickDay,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';
import {
  TEST_ZONES,
  TEST_ZONES_UTC_DAY,
  useTimeZone,
} from '@/test-fixtures/time-zone';
import { DateInputPicker } from '../date-input-picker';

beforeAll(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
});

afterAll(async () => {
  await testI18n.changeLanguage('en');
  testI18n.removeResourceBundle('en', 'translation');
  testI18n.removeResourceBundle('fr', 'translation');
});

function Harness({
  initial = '',
  onChange,
  label = 'From',
}: {
  initial?: string;
  onChange?: (value: string) => void;
  label?: string;
}) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <label htmlFor="day">{label}</label>
      <DateInputPicker
        id="day"
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        value={value}
      />
    </>
  );
}

const trigger = (label = 'From') => screen.getByLabelText(label);

describe('DateInputPicker', () => {
  it('is a button named by its label, with a placeholder while no day is chosen', () => {
    render(<Harness />);

    expect(trigger().tagName).toBe('BUTTON');
    expect(trigger()).toHaveTextContent('Pick a date');
    expect(pickerValue(trigger())).toBe('');
  });

  it.each(['2027-03-01', '2027-12-31', '2028-02-29', '2099-01-01', '2000-01-01'])(
    'gives back the day %s it was asked to pick, as the text of a date input',
    async (day) => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);

      await pickDay(userEvent.setup(), trigger(), day);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(day);
      expect(pickerValue(trigger())).toBe(day);
    },
  );

  it('shows the day it holds as selected in the calendar', async () => {
    render(<Harness initial="2027-03-05" />);

    await userEvent.setup().click(trigger());

    expect(
      document.querySelector('button[data-day="2027-03-05"]'),
    ).toHaveAttribute('data-selected-single', 'true');
  });

  it('keeps the day when it is picked again', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-05" onChange={onChange} />);

    await pickDay(userEvent.setup(), trigger(), '2027-03-05');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-05');
    expect(pickerValue(trigger())).toBe('2027-03-05');
  });

  it('clears the day', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-05" onChange={onChange} />);

    await clearPicker(userEvent.setup(), trigger());

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(trigger()).toHaveTextContent('Pick a date');
  });

  it.each(['soon', '2027-13-45', '2027-02-31'])(
    'shows %j as no day and leaves it as it is',
    (initial) => {
      const onChange = vi.fn();
      render(<Harness initial={initial} onChange={onChange} />);

      expect(trigger()).toHaveTextContent('Pick a date');
      expect(pickerValue(trigger())).toBe('');
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('walks the days of the month with the arrow keys and picks one with Enter', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2027-03-05" onChange={onChange} />);
    const user = userEvent.setup();

    await user.click(trigger());
    const selected = document.querySelector(
      'button[data-day="2027-03-05"]',
    ) as HTMLElement;
    selected.focus();
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenLastCalledWith('2027-03-13');
  });

  it('follows the language of the app', async () => {
    await testI18n.changeLanguage('fr');
    render(<Harness initial="2027-03-01" label="Du" />);

    expect(trigger('Du')).toHaveTextContent('1 mars 2027');

    await userEvent.setup().click(trigger('Du'));

    expect(
      await screen.findByRole('dialog', { name: 'Choisir une date' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: "Choisir l'année" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeInTheDocument();

    await testI18n.changeLanguage('en');
  });
});

// Zone-sensitive: a day written from the local fields of a Date, or read with
// toISOString, only differs from the UTC day in a zone that is not UTC.
describe.each(TEST_ZONES)('DateInputPicker in $zone', ({ zone, utcMoment }) => {
  useTimeZone(zone, utcMoment);

  it('shows the UTC day it holds', () => {
    render(<Harness initial="2027-03-01" />);

    expect(trigger()).toHaveTextContent('Mar 1, 2027');
    expect(pickerValue(trigger())).toBe('2027-03-01');
  });

  it.each(['2027-03-01', '2027-12-31', '2026-03-29', '2026-10-25'])(
    'gives back the day %s it was asked to pick',
    async (day) => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);

      await pickDay(userEvent.setup(), trigger(), day);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(day);
    },
  );

  it('marks the UTC day as today, not the day of the zone of the browser', async () => {
    // The moment is a day apart in the zone from the UTC day: the console
    // counts its days in UTC.
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
