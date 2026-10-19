import { waitFor, within } from '@testing-library/dom';

/**
 * Helpers to drive the date pickers (`DateInputPicker`, `DateTimePicker`) the way
 * a person does, in unit tests and in the `play` function of a story: open the
 * calendar, choose the year and the month, click the day, type the time in the
 * field beside the button of a date and time picker. They
 * take the `userEvent` of the caller, so both Testing Library flavours work.
 *
 * Days and times are the texts the pickers hold: `2027-03-03`, `10:00`. A day
 * has to fall in the years the calendar offers (2000 to 2100).
 */

type PickerUser = {
  click: (element: Element) => Promise<unknown>;
  selectOptions: (element: Element, values: string) => Promise<unknown>;
  keyboard: (keys: string) => Promise<unknown>;
};

const popup = () =>
  document.querySelector<HTMLElement>('[data-slot="popover-content"]');

/**
 * The value a picker holds, as the form that owns it sees it (`''` when none).
 * It is read from `data-value` on the button of the picker, the attribute the
 * unit, story and E2E helpers share (the visible text is localized): the pickers
 * keep it for this reason.
 */
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

/**
 * Opens a date and time picker, picks the day on its calendar, types the time
 * in its field (the digits of `10:00`, which fill the hours and then the
 * minutes) and leaves the picker, as a person who is done with it does, so that
 * the form marks the field as touched.
 */
export async function pickDateTime(
  user: PickerUser,
  trigger: HTMLElement,
  value: string,
) {
  const [day, time] = value.split('T');

  await pickDay(user, trigger, day);
  const group = trigger.closest<HTMLElement>('[data-slot="date-time-picker"]');
  const hours = group?.querySelector<HTMLElement>('[data-segment="hours"]');
  if (!group || !hours) {
    throw new Error('No time field beside the date button.');
  }
  await user.click(hours);
  await user.keyboard(time.replace(':', ''));
  await leave(user, group);
}

// Tab until the focus is out of the picker: its time field and its clock are
// stops of their own.
async function leave(user: PickerUser, group: HTMLElement) {
  for (
    let stop = 0;
    stop < 4 && group.contains(document.activeElement);
    stop++
  ) {
    await user.keyboard('{Tab}');
  }
  await waitFor(() => {
    if (group.contains(document.activeElement)) {
      throw new Error('The focus is still in the picker.');
    }
  });
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
