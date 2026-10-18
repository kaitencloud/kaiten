import { waitFor, within } from '@testing-library/dom';

/**
 * Helpers to drive the date pickers (`DateInputPicker`, `DateTimePicker`) the way
 * a person does, in unit tests and in the `play` function of a story: open the
 * calendar, choose the year and the month, click the day, type the time. They
 * take the `userEvent` of the caller, so both Testing Library flavours work.
 *
 * Days and times are the texts the pickers hold: `2027-03-03`, `10:00`. A day
 * has to fall in the years the calendar offers (2000 to 2100).
 */

type PickerUser = {
  click: (element: Element) => Promise<unknown>;
  clear: (element: Element) => Promise<unknown>;
  type: (element: Element, text: string) => Promise<unknown>;
  selectOptions: (element: Element, values: string) => Promise<unknown>;
  keyboard: (keys: string) => Promise<unknown>;
};

const popup = () =>
  document.querySelector<HTMLElement>('[data-slot="popover-content"]');

/** The value a picker holds, as the form that owns it sees it (`''` when none). */
export function pickerValue(trigger: HTMLElement): string {
  return trigger.getAttribute('data-value') ?? '';
}

async function openPicker(user: PickerUser, trigger: HTMLElement) {
  await user.click(trigger);

  return waitFor(() => {
    const open = popup();
    if (!open) {
      throw new Error('The calendar did not open.');
    }

    return open;
  });
}

async function waitForClosed() {
  await waitFor(() => {
    if (popup()) {
      throw new Error('The calendar is still open.');
    }
  });
}

async function chooseDay(user: PickerUser, calendar: HTMLElement, day: string) {
  const [year, month] = day.split('-');

  await user.selectOptions(
    within(calendar).getByRole('combobox', { name: /year|année/i }),
    String(Number(year)),
  );
  await user.selectOptions(
    within(calendar).getByRole('combobox', { name: /month|mois/i }),
    String(Number(month) - 1),
  );

  const button = calendar.querySelector<HTMLElement>(
    `button[data-day="${day}"]`,
  );
  if (!button) {
    throw new Error(`No day ${day} in the calendar.`);
  }
  await user.click(button);
}

/** Opens a day picker and picks the day: the calendar closes with the pick. */
export async function pickDay(
  user: PickerUser,
  trigger: HTMLElement,
  day: string,
) {
  const calendar = await openPicker(user, trigger);

  await chooseDay(user, calendar, day);
  await waitForClosed();
}

/** Opens a date and time picker, picks the day, types the time and closes it. */
export async function pickDateTime(
  user: PickerUser,
  trigger: HTMLElement,
  value: string,
) {
  const [day, time] = value.split('T');
  const calendar = await openPicker(user, trigger);

  await chooseDay(user, calendar, day);
  const timeInput = calendar.querySelector('input');
  if (!timeInput) {
    throw new Error('No time field in the calendar.');
  }
  await user.clear(timeInput);
  await user.type(timeInput, time);
  await user.keyboard('{Escape}');
  await waitForClosed();
}

/** Opens a picker and clears it with the button of the calendar. */
export async function clearPicker(user: PickerUser, trigger: HTMLElement) {
  const calendar = await openPicker(user, trigger);
  const button = Array.from(calendar.querySelectorAll('button')).at(-1);
  if (!button) {
    throw new Error('No clear button in the calendar.');
  }
  await user.click(button);
  await waitForClosed();
}
