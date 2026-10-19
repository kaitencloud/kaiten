import { expect, type Locator } from '@playwright/test';

/**
 * The date pickers of the console (`DateInputPicker`, `DateTimePicker`): a button
 * that opens a calendar in a popover, and, for a date and time, a time field
 * beside it. These helpers drive one the way a person does, from the button the
 * label of the field names: open the calendar, choose the year and the month,
 * click the day, type the time in the field. Days and times are the texts the
 * pickers hold, `2027-03-01` and `2027-03-03T10:00`, in UTC; a day has to fall
 * in the years the calendar offers (2000 to 2100).
 *
 * A date and time picker names the pair of controls as a group with the same
 * label, so `getByLabel` finds two elements: locate the button by its role,
 * `getByRole('button', { name })`, and pass it here.
 */

// The calendar is a dialog of its own, named for what it picks, portaled to the
// body: a filter or a form that holds the picker is a dialog too.
const CALENDAR = /^(Choose a date|Choisir une date)/;

function calendarOf(trigger: Locator): Locator {
  return trigger.page().getByRole('dialog', { name: CALENDAR });
}

async function openCalendar(trigger: Locator): Promise<Locator> {
  await trigger.click();
  const calendar = calendarOf(trigger);
  await expect(calendar).toBeVisible();

  return calendar;
}

async function chooseDay(calendar: Locator, day: string) {
  const [year, month] = day.split('-');

  await calendar
    .getByRole('combobox', { name: /year|année/i })
    .selectOption(String(Number(year)));
  await calendar
    .getByRole('combobox', { name: /month|mois/i })
    .selectOption(String(Number(month) - 1));
  await calendar.locator(`button[data-day="${day}"]`).click();
}

/** Picks the day on the calendar of a day picker: it closes with the pick. */
export async function pickDay(trigger: Locator, day: string) {
  const calendar = await openCalendar(trigger);

  await chooseDay(calendar, day);
  await expect(calendar).toBeHidden();
}

/**
 * Picks the day on the calendar of a date and time picker, then types the time
 * in its field (the digits of `10:00`, which fill the hours and then the
 * minutes) and leaves it, so that the field says what is wrong.
 */
export async function pickDateTime(trigger: Locator, value: string) {
  const [day, time] = value.split('T');
  const group = trigger.locator(
    'xpath=ancestor::*[@data-slot="date-time-picker"]',
  );
  const hours = group.getByRole('spinbutton', { name: /^(Hours|Heures)$/ });

  await pickDay(trigger, day);
  await hours.click();
  await hours.pressSequentially(time.replace(':', ''));
  await group.getByRole('spinbutton', { name: 'Minutes' }).blur();
}

/**
 * Sets the time of a date and time picker from the columns of its clock, as a
 * person who points does: opens the columns, clicks the hour and the minute,
 * and closes them with Escape, which must leave whatever holds the picker (a
 * dialog) open, with the focus back on the segment the person came from, the minutes they chose last.
 */
export async function pickTimeFromColumns(trigger: Locator, time: string) {
  const [hours, minutes] = time.split(':');
  const group = trigger.locator(
    'xpath=ancestor::*[@data-slot="date-time-picker"]',
  );
  const page = trigger.page();
  const columns = page.getByRole('dialog', {
    name: /^(Choose a time|Choisir une heure)/,
  });

  await group
    .getByRole('button', { name: /^(Choose a time|Choisir une heure)$/ })
    .click();
  await expect(columns).toBeVisible();
  await columns
    .getByRole('listbox', { name: /^(Hours|Heures)$/ })
    .getByRole('option', { exact: true, name: hours })
    .click();
  await columns
    .getByRole('listbox', { name: 'Minutes' })
    .getByRole('option', { exact: true, name: minutes })
    .click();
  await page.keyboard.press('Escape');
  await expect(columns).toBeHidden();
  await expect(
    group.getByRole('spinbutton', { name: 'Minutes' }),
  ).toBeFocused();
}

/** Clears a picker with the button of its calendar. */
export async function clearPicker(trigger: Locator) {
  const calendar = await openCalendar(trigger);

  await calendar.getByRole('button', { name: /^(Clear|Effacer)$/ }).click();
  await expect(calendar).toBeHidden();
}

/** The value a picker holds, as the form that owns it sees it: the text a date input holds, empty when none. */
export async function expectPickerValue(trigger: Locator, value: string) {
  await expect(trigger).toHaveAttribute('data-value', value);
}
