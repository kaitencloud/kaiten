import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';

function Harness() {
  const form = useAppForm({
    defaultValues: { amount: 1, kind: 'a', name: '', note: '' },
  });

  return (
    <form.AppForm>
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" />}
      </form.AppField>
      <form.AppField name="note">
        {(field) => <field.TextAreaField label="Note" />}
      </form.AppField>
      <form.AppField name="amount">
        {(field) => <field.NumberField label="Amount" />}
      </form.AppField>
      <form.AppField name="kind">
        {(field) => (
          <field.SelectField
            getOptionLabel={(option) => String(option)}
            label="Kind"
            options={['a', 'b']}
          />
        )}
      </form.AppField>
      <form.SubmitButton label="Save" />
    </form.AppForm>
  );
}

// A field that suspends on its first render holds the nearest fallback on screen for
// about 300 ms, whatever its load time: the form would open behind a spinner. These
// render with no Suspense boundary and read straight away, so a field made `lazy`
// again fails here instead of in front of a person.
describe('useAppForm', () => {
  it('draws its fields and its submit button on the first render', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Kind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
