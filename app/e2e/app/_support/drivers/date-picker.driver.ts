import { expect, type Locator } from '@playwright/test';

/**
 * The date pickers of the console (`DateInputPicker`, `DateTimePicker`): a button
 * that opens a calendar in a popover. These helpers drive one the way a person
 * does, from the button the label of the field names: open the calendar, choose
 * the year and the month, click the day, type the time. Days and times are the
 * texts the pickers hold, `2027-03-01` and `2027-03-03T10:00`, in UTC; a day has
 * to fall in the years the calendar offers (2000 to 2100).
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

/** Picks the day and types the time on the calendar of a date and time picker, then closes it so that the field says what is wrong. */
export async function pickDateTime(trigger: Locator, value: string) {
  const [day, time] = value.split('T');
  const calendar = await openCalendar(trigger);

  await chooseDay(calendar, day);
  const timeField = calendar.getByRole('textbox');
  await timeField.fill(time);
  await timeField.press('Enter');
  await expect(calendar).toBeHidden();
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
