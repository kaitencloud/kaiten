import { render, screen } from '@testing-library/react';
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

describe('DateTimeField', () => {
  it('is a calendar button with its label and its help text', async () => {
    render(<Harness />);

    const trigger = await screen.findByLabelText('Paid at (UTC)');

    expect(trigger.tagName).toBe('BUTTON');
    expect(pickerValue(trigger)).toBe('');
    expect(trigger).toHaveAccessibleDescription(
      'Read as UTC. Pick a date and time',
    );
  });

  it('holds the text a datetime-local input held: a date, a time, no zone', async () => {
    render(<Harness />);

    const trigger = await screen.findByLabelText('Paid at (UTC)');
    await pickDateTime(userEvent.setup(), trigger, '2027-03-03T10:00');

    expect(pickerValue(trigger)).toBe('2027-03-03T10:00');
  });

  it('starts from the value the form gives it, and clears it', async () => {
    render(<Harness initial="2027-03-03T10:00" />);

    const trigger = await screen.findByLabelText('Paid at (UTC)');
    expect(pickerValue(trigger)).toBe('2027-03-03T10:00');

    await clearPicker(userEvent.setup(), trigger);

    expect(pickerValue(trigger)).toBe('');
  });

  it('says what is wrong with the value, beside the control', async () => {
    render(<Harness />);

    const trigger = await screen.findByLabelText('Paid at (UTC)');
    await pickDateTime(userEvent.setup(), trigger, '2031-01-01T00:00');

    expect(await screen.findByText('Tests.tooLate')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });
});
