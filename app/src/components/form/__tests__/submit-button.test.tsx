import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { useAppForm } from '@/hooks/form';
import SubmitButton from '../submit-button';

// The form validates on mount here, so an empty name is invalid before any
// edit, the way a create form's required fields are.
function Harness({
  allowPristine,
  name,
}: {
  allowPristine?: boolean;
  name: string;
}) {
  const form = useAppForm({
    defaultValues: { name },
    validators: {
      onMount: ({ value }) => (value.name ? undefined : 'required'),
    },
  });

  return (
    <form.AppForm>
      <SubmitButton allowPristine={allowPristine} label="Save" />
    </form.AppForm>
  );
}

describe('SubmitButton', () => {
  it('waits for a change before an untouched form can be submitted', () => {
    render(<Harness name="Enterprise v2" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('lets an untouched form be submitted when its defaults are complete', () => {
    render(<Harness allowPristine name="Enterprise v2" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('still refuses an invalid form', () => {
    render(<Harness allowPristine name="" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
