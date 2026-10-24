import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';

describe('Select', () => {
  // Base UI gives the open list no name; the trigger's name is the list's.
  it('names the open list after its trigger', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger aria-label="Fruit">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));

    expect(await screen.findByRole('listbox', { name: 'Fruit' })).toBeVisible();
  });

  // A field wraps the trigger in a control that gives it the id of the field and a
  // `<label for>`: the list follows the id the trigger really has.
  it('names the open list after the label of a trigger whose id is set from outside', async () => {
    const user = userEvent.setup();

    render(
      <>
        <label htmlFor="plan-field">Plan</label>
        <Select>
          <SelectTrigger id="plan-field">
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pro">Pro</SelectItem>
          </SelectContent>
        </Select>
      </>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Plan' }));

    expect(await screen.findByRole('listbox', { name: 'Plan' })).toBeVisible();
  });
});
