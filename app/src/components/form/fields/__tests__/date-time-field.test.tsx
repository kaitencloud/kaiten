import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { testI18n } from '@/__tests__/test-i18n';
import { useAppForm } from '@/hooks/form';
import en from '@/lib/i18n/locales/en';
import {
  clearPicker,
  pickDateTime,
  pickerValue,
} from '@/test-fixtures/date-picker-test-support';

const schema = z.object({
  paidAt: z.string().refine((value) => value <= '2030-01-01T00:00', 'Tests.tooLate'),
});

const requiredSchema = z.object({
  paidAt: z
    .string()
    .min(1, 'Tests.required')
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Tests.invalid'),
});

beforeAll(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
});

afterAll(() => {
  testI18n.removeResourceBundle('en', 'translation');
});

function Harness({ initial = '' }: { initial?: string }) {
  const form = useAppForm({
    defaultValues: { paidAt: initial },
    validators: { onChange: schema },
  });

  return (
    <form.AppField name="paidAt">
      {(field) => (
        <field.DateTimeField
          description="Read as UTC."
          label="Paid at (UTC)"
        />
      )}
    </form.AppField>
  );
}

function RequiredHarness({ initial = '' }: { initial?: string }) {
  const form = useAppForm({
    defaultValues: { paidAt: initial },
    validators: { onBlur: requiredSchema },
  });

  return (
    <>
      <form.AppField name="paidAt">
        {(field) => <field.DateTimeField label="Paid at (UTC)" />}
      </form.AppField>
      <button type="button">After</button>
    </>
  );
}

describe('DateTimeField', () => {
  it('is a calendar button with its label and its help text', async () => {
    render(<Harness />);

    const trigger = await screen.findByRole('button', { name: 'Paid at (UTC)' });

    expect(trigger.tagName).toBe('BUTTON');
    expect(pickerValue(trigger)).toBe('');
    expect(trigger).toHaveAccessibleDescription('Read as UTC. Pick a date');
  });

  it('is a group the label names, with the date button and the time field in it', async () => {
    render(<Harness />);

    const group = await screen.findByRole('group', { name: 'Paid at (UTC)' });
    const trigger = within(group).getByRole('button', { name: 'Paid at (UTC)' });

    expect(trigger).toBeInTheDocument();
    expect(
      within(group).getByRole('group', { name: /^Time \(UTC\)/ }),
    ).toBeInTheDocument();
    expect(within(group).getByRole('spinbutton', { name: 'Hours' })).toBeInTheDocument();
  });

  it('holds the text a datetime-local input held: a date, a time, no zone', async () => {
    render(<Harness />);

    const trigger = await screen.findByRole('button', { name: 'Paid at (UTC)' });
    await pickDateTime(userEvent.setup(), trigger, '2027-03-03T10:00');

    expect(pickerValue(trigger)).toBe('2027-03-03T10:00');
  });

  it('starts from the value the form gives it, and clears it', async () => {
    render(<Harness initial="2027-03-03T10:00" />);

    const trigger = await screen.findByRole('button', { name: 'Paid at (UTC)' });
    expect(pickerValue(trigger)).toBe('2027-03-03T10:00');

    await clearPicker(userEvent.setup(), trigger);

    expect(pickerValue(trigger)).toBe('');
  });

  it('says what is wrong with the value, beside the control', async () => {
    render(<Harness />);

    const trigger = await screen.findByRole('button', { name: 'Paid at (UTC)' });
    await pickDateTime(userEvent.setup(), trigger, '2031-01-01T00:00');

    expect(await screen.findByText('Tests.tooLate')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks a required field as touched once the pair is left, and shows its error once', async () => {
    render(<RequiredHarness />);
    const user = userEvent.setup();

    const trigger = await screen.findByRole('button', { name: 'Paid at (UTC)' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The calendar closed with the focus back on the button: still inside the
    // pair, so the field is not touched yet.
    expect(trigger).toHaveFocus();
    expect(screen.queryByText('Tests.required')).toBeNull();

    // Moving across the time field is still inside the pair.
    await user.tab();
    await user.tab();
    expect(screen.queryByText('Tests.required')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'After' }));

    expect(await screen.findByText('Tests.required')).toBeInTheDocument();
    expect(screen.getAllByText('Tests.required')).toHaveLength(1);
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    // The time field is told of the error too, and described by it.
    expect(screen.getByRole('spinbutton', { name: 'Hours' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByRole('group', { name: /^Time \(UTC\)/ }),
    ).toHaveAccessibleDescription(expect.stringContaining('Tests.required'));
  });

  it('shows one message, the form\'s, for a half-filled time that was left', async () => {
    render(<RequiredHarness initial="2027-03-03T10:00" />);
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'Paid at (UTC)' });
    await user.click(screen.getByRole('spinbutton', { name: 'Minutes' }));
    await user.keyboard('{Backspace}');
    await user.click(screen.getByRole('button', { name: 'After' }));

    expect(await screen.findByText('Tests.invalid')).toBeInTheDocument();
    // The picker leaves its own message to the form's: one message, not two.
    expect(screen.queryByText(/Enter a complete time/)).toBeNull();
    expect(screen.getByRole('spinbutton', { name: 'Hours' })).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(screen.getByRole('spinbutton', { name: 'Minutes' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByRole('group', { name: /^Time \(UTC\)/ }),
    ).toHaveAccessibleDescription(expect.stringContaining('Tests.invalid'));
  });
});
